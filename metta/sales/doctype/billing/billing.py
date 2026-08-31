# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.sales.doctype.patient_advance.patient_advance import get_advance_balance
from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
	validate_sufficient_batch_stock,
	validate_sufficient_stock,
)


PHARMACY_ITEM_TYPES = ("Medicine", "Consumable")


class Billing(Document):
	def validate(self):
		self.clear_items_not_matching_bill_type()
		self.validate_has_items()
		self.set_pharmacy_warehouse()
		self.validate_warehouse()

		# mandatory_depends_on only blocks the Save button in the browser -
		# it isn't checked by Frappe's server-side mandatory-field validation,
		# so API calls/imports could skip this without a check here.
		if self.payment_mode == "Credit - Corporate" and not self.corporate_customer:
			frappe.throw(
				_("Corporate Customer is mandatory when Payment Mode is Credit - Corporate."),
				title=_("Corporate Customer Required"),
			)

		# JS keeps this live while editing, but validate() is the authoritative
		# recompute, same as Purchase Bill's subtotal/gst/total.
		#
		# discount_percent is fetched straight from the Category Price
		# Adjustment record, but that record's own adjustment_type ("Discount"
		# vs "Increase") and discount_status ("Active"/"Inactive") aren't
		# fetched onto Billing anywhere - so they have to be looked up here
		# to actually be enforced, not just displayed.
		adjustment_type = None
		if self.billing_category:
			category = frappe.db.get_value(
				"Category Price Adjustment", self.billing_category, ["adjustment_type", "discount_status"], as_dict=True
			)
			if category and category.discount_status == "Active":
				adjustment_type = category.adjustment_type

		if adjustment_type not in ("Discount", "Increase"):
			# No active adjustment applies - an Inactive category, or one with
			# no adjustment_type set, contributes nothing to the bill.
			self.discount_percent = 0

		# Signed so "Discount" shrinks the taxable value and "Increase" grows
		# it, using the same +/- formula either way.
		signed_percent = -flt(self.discount_percent) if adjustment_type == "Increase" else flt(self.discount_percent)

		# Rounded to currency precision at every step - an unrounded float
		# (e.g. 0.07200000000000001) recomputed on a later re-save of an
		# already-submitted bill would otherwise differ from the originally
		# stored value at the 17th decimal place, which Frappe treats as a
		# real edit and blocks with "Cannot Update After Submit".
		subtotal = 0
		gst_total = 0
		for row in self.pharmacy_items + self.service_items:
			if not flt(row.qty):
				frappe.throw(
					_("Row {0} ({1}): Qty must be greater than 0.").format(row.idx, row.item_name or row.item),
					title=_("Invalid Qty"),
				)
			row.amount = flt(flt(row.qty) * flt(row.rate), 2)
			taxable_value = row.amount * (1 - signed_percent / 100)
			row.gst_amount = flt(taxable_value * flt(row.gst_percent) / 100, 2)
			subtotal += row.amount
			gst_total += row.gst_amount
		self.subtotal = flt(subtotal, 2)
		# discount_amount stays signed too, so the same subtraction below
		# works for both directions: positive shrinks net_amount (Discount),
		# negative grows it (Increase).
		self.discount_amount = flt(self.subtotal * signed_percent / 100, 2)
		self.gst_amount = flt(gst_total, 2)
		self.net_amount = flt(self.subtotal - self.discount_amount + self.gst_amount, 2)

		self.validate_advance_adjustment()
		self.validate_amount_collected()

	def validate_amount_collected(self):
		# Defaults to fully collected (today's normal case) unless someone
		# deliberately reduces it for a genuine partial payment - this is what
		# Collection Report's Cash Amt/Epay/Credit Bills actually sum, so an
		# advance-covered bill doesn't get double-counted as if it were also
		# collected via Payment Mode.
		if not self.amount_collected:
			self.amount_collected = self.amount_due
			return

		if flt(self.amount_collected) < 0:
			frappe.throw(_("Amount Collected Now cannot be negative."))
		if flt(self.amount_collected) > flt(self.amount_due):
			frappe.throw(
				_("Amount Collected Now cannot exceed Amount Due ({0}).").format(
					frappe.format(self.amount_due, {"fieldtype": "Currency"})
				),
				title=_("Invalid Amount Collected"),
			)

	def validate_advance_adjustment(self):
		if not self.advance_adjusted:
			self.amount_due = self.net_amount
			return

		if not self.patient:
			frappe.throw(_("Select a Patient before adjusting an advance against this bill."))

		if flt(self.advance_adjusted) > flt(self.net_amount):
			frappe.throw(
				_("Advance Adjusted cannot exceed the Net Amount."), title=_("Invalid Advance Adjustment")
			)

		# Add back this same doc's own previous value - otherwise re-saving an
		# already-adjusted bill would see its own prior adjustment as
		# unavailable, since get_advance_balance() has no way to know to
		# exclude what this same record already consumed.
		previous = flt(frappe.db.get_value("Billing", self.name, "advance_adjusted")) if not self.is_new() else 0
		balance = get_advance_balance(self.patient)["balance"] + previous
		if flt(self.advance_adjusted) > balance:
			frappe.throw(
				_("Only {0} is available in this patient's advance balance.").format(
					frappe.format(balance, {"fieldtype": "Currency"})
				),
				title=_("Advance Balance Exceeded"),
			)

		self.amount_due = flt(self.net_amount) - flt(self.advance_adjusted)

	def validate_has_items(self):
		# Pharmacy Items and Service Items are two separate tables now (each
		# individually optional, since a pure-service bill has no pharmacy
		# rows and vice versa) - but a bill with nothing in either is empty
		# and shouldn't be allowed to save at all.
		if not (self.pharmacy_items or self.service_items):
			frappe.throw(
				_("Add at least one item to Pharmacy Items or Service Items before saving."),
				title=_("No Items"),
			)

	def clear_items_not_matching_bill_type(self):
		# Bill Type is what actually decides which section(s) are shown - if
		# it's narrowed after the other section already had rows in it (e.g.
		# switched from Mixed to Pharmacy-only), those hidden rows shouldn't
		# silently keep existing in the background; they're cleared here
		# rather than lingering un-shown but still billed.
		dropped = False
		if self.bill_type == "Pharmacy" and self.service_items:
			self.set("service_items", [])
			dropped = True
		elif self.bill_type == "Service" and self.pharmacy_items:
			self.set("pharmacy_items", [])
			dropped = True

		if dropped:
			# The bill just got smaller - whatever was previously typed into
			# Advance Adjusted / Amount Collected Now could easily exceed the
			# new, smaller total. Clearing them lets validate_advance_adjustment()/
			# validate_amount_collected() below recompute correct defaults for
			# the new total instead of throwing over a stale prior value.
			self.advance_adjusted = 0
			self.amount_collected = 0

	def set_pharmacy_warehouse(self):
		# Warehouse is no longer a field staff pick by hand - there's only
		# ever one real pharmacy dispensing point, so it's looked up and set
		# automatically whenever Pharmacy Items actually has something on it.
		if not self.pharmacy_items:
			self.warehouse = None
			return
		if self.warehouse:
			return
		self.warehouse = get_pharmacy_warehouse()
		if not self.warehouse:
			frappe.throw(
				_("No active Pharmacy warehouse is set up - ask an admin to create one before billing medicines."),
				title=_("No Pharmacy Warehouse"),
			)

	def validate_warehouse(self):
		# Central Store only ever receives from suppliers and distributes to
		# sub-stores - it never dispenses directly to a patient. The client
		# hides it from the picker, but that's only a convenience this check
		# can't be bypassed by an API call or import.
		if not self.warehouse:
			return
		warehouse_type = frappe.db.get_value("Warehouse", self.warehouse, "warehouse_type")
		if warehouse_type == "Central Store":
			frappe.throw(
				_("Warehouse cannot be Central Store - Billing has to dispense from a sub-store."),
				title=_("Invalid Warehouse"),
			)

	def on_submit(self):
		# Stock moves immediately on submit - Billing Staff finalizing the
		# bill is what hands the medicine over, so this is the point stock
		# has to reflect that. Service Items never reach here at all - only
		# Pharmacy Items can hold real stock rows.
		for row in self.pharmacy_items:
			row.stock_qty = flt(row.qty) * flt(row.conversion_factor or 1)
			row.db_set("stock_qty", row.stock_qty, update_modified=False)
			validate_sufficient_stock(row.item, self.warehouse, row.stock_qty)
			# The item+warehouse total above isn't enough on its own once
			# different batches carry different prices - this stops a specific
			# batch from going negative even while other batches of the same
			# item still have stock left.
			if row.batch_no:
				validate_sufficient_batch_stock(row.item, self.warehouse, row.batch_no, row.stock_qty)
			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.warehouse,
				batch_no=row.batch_no,
				posting_datetime=frappe.utils.now_datetime(),
				voucher_type="Billing",
				voucher_no=self.name,
				qty_change=-row.stock_qty,
			)

	def on_cancel(self):
		reverse_stock_ledger_entries("Billing", self.name)


@frappe.whitelist()
def get_category_adjustment(billing_category):
	# JS needs the same adjustment_type/discount_status check validate() does,
	# so the live total preview matches what actually gets saved.
	frappe.has_permission("Billing", "read", throw=True)
	if not billing_category:
		return {"adjustment_type": None, "discount_status": None}
	category = frappe.db.get_value(
		"Category Price Adjustment", billing_category, ["adjustment_type", "discount_status"], as_dict=True
	)
	return category or {"adjustment_type": None, "discount_status": None}


IP_ADMISSION_CHARGE_ITEM = "IP-ADMISSION-CHARGE"


@frappe.whitelist()
def get_admission_charge_row(patient):
	# Mirrors the legacy system: converting OP to IP brings a flat admission
	# charge onto the bill automatically the moment the IP visit is entered
	# here - not something Billing Staff has to remember to add by hand.
	# Checked against every non-cancelled bill already raised for this same
	# visit so re-opening/re-billing the same admission never double-charges it.
	frappe.has_permission("Billing", "read", throw=True)
	if not patient:
		return None
	registration_category = frappe.db.get_value("Patient Visit", patient, "registration_category")
	if registration_category != "IP":
		return None

	already_charged = frappe.db.exists(
		"Sales Bill Item",
		{
			"item": IP_ADMISSION_CHARGE_ITEM,
			"parenttype": "Billing",
			"parent": ["in", frappe.get_all("Billing", filters={"patient": patient, "docstatus": ["!=", 2]}, pluck="name")],
		},
	)
	if already_charged:
		return None

	return _billing_row(IP_ADMISSION_CHARGE_ITEM, "IP Admission Charge", 1)


def get_pharmacy_warehouse():
	# There's only ever one real pharmacy dispensing point in this hospital -
	# shared by the auto-warehouse logic and the FEFO batch lookup below,
	# both of which need to know which warehouse's stock actually applies.
	return frappe.db.get_value("Warehouse", {"warehouse_type": "Pharmacy", "is_active": 1}, "name", order_by="name")


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def pharmacy_item_query(doctype, txt, searchfield, start, page_len, filters):
	# What actually matters for dispensing is real stock on hand right now,
	# not just an item's Group/Category tagging - an item correctly tagged
	# "Pharmacy Store" with nothing left in stock has nothing to offer here,
	# so this joins against the Pharmacy warehouse's own Stock Balance
	# instead of trusting the item's classification alone.
	frappe.has_permission("Billing", "read", throw=True)
	warehouse = get_pharmacy_warehouse()
	if not warehouse:
		return []

	return frappe.db.sql(
		"""
		SELECT DISTINCT i.name, i.item_name
		FROM `tabItem` i
		INNER JOIN `tabStock Balance` sb ON sb.item = i.name AND sb.warehouse = %(warehouse)s AND sb.actual_qty > 0
		LEFT JOIN `tabChemical Composition` cc ON cc.name = i.chemical_composition
		LEFT JOIN `tabChemical Composition Term` cct ON cct.parent = cc.name
		LEFT JOIN `tabChemical Term` ct ON ct.name = cct.chemical_term
		WHERE i.item_type IN %(item_types)s AND i.is_active = 1
			AND (i.item_name LIKE %(txt)s OR cc.name LIKE %(txt)s OR ct.name LIKE %(txt)s)
		ORDER BY i.item_name
		LIMIT %(page_len)s OFFSET %(start)s
		""",
		{
			"warehouse": warehouse,
			"item_types": list(PHARMACY_ITEM_TYPES),
			"txt": f"%{txt}%",
			"start": start,
			"page_len": page_len,
		},
	)


@frappe.whitelist()
def get_fefo_batch(item_code):
	# First-Expiry-First-Out - standard pharmacy dispensing practice, and
	# not something a busy front desk should have to remember to apply by
	# hand every time; still just a starting point, the field stays editable
	# if a specific batch genuinely needs to be picked instead.
	frappe.has_permission("Billing", "read", throw=True)
	if not item_code or not frappe.db.get_value("Item", item_code, "has_batch"):
		return None
	warehouse = get_pharmacy_warehouse()
	if not warehouse:
		return None
	rows = frappe.db.sql(
		"""
		select sle.batch_no
		from `tabStock Ledger Entry` sle
		inner join `tabBatch` b on b.name = sle.batch_no
		where sle.item = %(item)s and sle.warehouse = %(warehouse)s
			and sle.batch_no is not null and sle.batch_no != '' and b.disabled = 0
		group by sle.batch_no
		having sum(sle.qty_change) > 0
		order by b.expiry_date asc
		limit 1
		""",
		{"item": item_code, "warehouse": warehouse},
		as_dict=True,
	)
	return rows[0].batch_no if rows else None


def _billing_row(item_code, item_name, qty):
	item_details = frappe.db.get_value(
		"Item",
		item_code,
		["unit_of_measure", "standard_selling_rate", "gst_percent", "has_batch", "item_type"],
		as_dict=True,
	) or frappe._dict()
	# Medicine/Consumable pricing lives on the Batch, not the Item - rate is
	# resolved client-side once a warehouse is known and batches can be
	# allocated (see billing.js). Service items aren't batch-tracked, so
	# Service Rate still applies directly, same as before.
	is_batched = item_details.item_type in ("Medicine", "Consumable")
	rate = 0 if is_batched else flt(item_details.standard_selling_rate)
	return {
		"item": item_code,
		"item_name": item_name,
		"item_type": item_details.item_type,
		"qty": flt(qty),
		"uom": item_details.unit_of_measure or "",
		"rate": rate,
		"gst_percent": flt(item_details.gst_percent),
		"amount": rate * flt(qty),
		"batch_no": get_fefo_batch(item_code) if item_details.has_batch else None,
	}


@frappe.whitelist()
def search_items_for_billing(search_term="", table="pharmacy_items"):
	# Powers the quick-add widget above each Items table - Pharmacy Items
	# only ever searches Medicine/Consumable, Service Items only ever
	# searches Service, same split the two tables themselves enforce.
	#
	# Also matches the item's linked Chemical Composition and the Chemical
	# Terms inside it - staff often know a drug by its salt/generic name
	# ("para") rather than the specific brand actually stocked ("Dolo 650").
	frappe.has_permission("Billing", "read", throw=True)
	item_types = list(PHARMACY_ITEM_TYPES) if table == "pharmacy_items" else ["Service"]

	values = {"item_types": item_types, "limit": 20}
	search_condition = ""
	if search_term:
		search_condition = """
			AND (i.item_name LIKE %(search_term)s
				OR cc.name LIKE %(search_term)s OR ct.name LIKE %(search_term)s)
		"""
		values["search_term"] = f"%{search_term}%"

	items = frappe.db.sql(
		f"""
		SELECT DISTINCT i.name AS item_code, i.item_name, i.standard_selling_rate
		FROM `tabItem` i
		LEFT JOIN `tabChemical Composition` cc ON cc.name = i.chemical_composition
		LEFT JOIN `tabChemical Composition Term` cct ON cct.parent = cc.name
		LEFT JOIN `tabChemical Term` ct ON ct.name = cct.chemical_term
		WHERE i.item_type IN %(item_types)s AND i.is_active = 1
		{search_condition}
		ORDER BY i.item_name
		LIMIT %(limit)s
		""",
		values,
		as_dict=True,
	)

	pharmacy_warehouse = None
	if table == "pharmacy_items":
		pharmacy_warehouse = frappe.db.get_value("Warehouse", {"warehouse_type": "Pharmacy", "is_active": 1}, "name")

	result = []
	for it in items:
		avail_qty = None
		if pharmacy_warehouse:
			avail_qty = (
				frappe.db.get_value(
					"Stock Balance", {"item": it.item_code, "warehouse": pharmacy_warehouse}, "actual_qty"
				)
				or 0
			)
			# Nothing to dispense if there's really none left - same rule
			# pharmacy_item_query enforces for the Items table's own Link field.
			if avail_qty <= 0:
				continue
		result.append(
			{
				"item_code": it.item_code,
				"name": it.item_name,
				"rate": flt(it.standard_selling_rate),
				"avail_qty": avail_qty,
			}
		)
	return result


@frappe.whitelist()
def get_billing_item_row(item_code, qty=1):
	# Same shape _billing_row() already builds for the auto-added admission
	# charge - reused here so the quick-add widget's "Add" button fills in
	# uom/rate/gst_percent/amount exactly the same way.
	frappe.has_permission("Billing", "read", throw=True)
	item_name = frappe.db.get_value("Item", item_code, "item_name") or item_code
	return _billing_row(item_code, item_name, qty)


@frappe.whitelist()
def get_unbilled_consultations_for_patient(patient):
	# Billing starts from the patient, not from hunting down the right
	# Doctor Consultation first - this is what lets the form offer "load
	# what was prescribed" the moment a patient is picked.
	frappe.has_permission("Billing", "read", throw=True)
	if not patient:
		return []

	already_billed = set(
		frappe.get_all(
			"Billing",
			filters={"doctor_consultation": ["is", "set"], "docstatus": ["!=", 2]},
			pluck="doctor_consultation",
		)
	)

	consultations = frappe.get_all(
		"Doctor Consultation",
		filters={"patient_consultation": patient},
		fields=["name", "doctor", "consultation_datetime"],
		order_by="consultation_datetime desc",
	)

	result = []
	for row in consultations:
		if row.name in already_billed:
			continue
		has_items = frappe.db.exists("Prescription Item", {"parent": row.name}) or frappe.db.exists(
			"Suggested Test", {"parent": row.name}
		)
		if has_items:
			result.append(row)
	return result


@frappe.whitelist()
def get_billing_items_for_consultation(consultation):
	# Billing raises ONE consolidated bill covering everything prescribed for
	# this consultation - medicines Pharmacy will hand over, and tests Lab/
	# X-ray will carry out - rather than each department billing separately.
	frappe.has_permission("Doctor Consultation", "read", throw=True)

	existing = frappe.db.get_value(
		"Billing", {"doctor_consultation": consultation, "docstatus": ["!=", 2]}, "name"
	)
	if existing:
		frappe.throw(
			_("This consultation has already been billed - see {0}.").format(existing),
			title=_("Already Billed"),
		)

	consult = frappe.db.get_value(
		"Doctor Consultation", consultation, ["patient_consultation", "doctor"], as_dict=True
	)
	if not consult:
		frappe.throw(_("Doctor Consultation {0} not found.").format(consultation))

	billing_category = frappe.db.get_value("Patient Visit", consult.patient_consultation, "billing_category")

	medicines = [
		_billing_row(row.item, row.item_name, row.qty)
		for row in frappe.get_all(
			"Prescription Item", filters={"parent": consultation}, fields=["item", "item_name", "qty"], order_by="idx"
		)
	]
	tests = [
		# A test is never billed by quantity - one line per test suggested.
		_billing_row(row.item, row.item_name, 1)
		for row in frappe.get_all(
			"Suggested Test", filters={"parent": consultation}, fields=["item", "item_name"], order_by="idx"
		)
	]

	if not medicines and not tests:
		frappe.throw(_("This consultation has no prescribed medicines or suggested tests to bill."))

	# Medicines go to Pharmacy Items, tests go to Service Items - known from
	# which list each came from (prescribed_items is always Medicine,
	# suggested_tests is always Service, per Doctor Consultation's own query
	# filters) rather than re-checking each item's own type here.
	return {
		"patient": consult.patient_consultation,
		"doctor": consult.doctor,
		"billing_category": billing_category,
		"pharmacy_items": medicines,
		"service_items": tests,
	}


@frappe.whitelist()
def has_discharge_summary(patient_visit):
	# The final bill is only meaningful once the doctor has actually signed
	# off clinically - Billing shouldn't be able to hand over a "discharge"
	# bill before that's on record.
	frappe.has_permission("Billing", "read", throw=True)
	if not patient_visit:
		return False
	return bool(frappe.db.exists("Discharge Summary", {"patient_visit": patient_visit}))


def _visit_id_query(registration_category, txt, start, page_len):
	# Patient Visit's own title (patient name) would otherwise be the only
	# thing shown while searching, making same-named patients indistinguishable -
	# returning the name as a second column shows it as a small line under
	# the actual ID, without changing what ends up in the field once picked.
	frappe.has_permission("Billing", "read", throw=True)
	return frappe.db.sql(
		"""
		select pv.name, pr.patient_name
		from `tabPatient Visit` pv
		left join `tabPatient Registration` pr on pr.name = pv.uhin_id
		where pv.registration_category = %(registration_category)s
			and (pv.name like %(txt)s or pr.patient_name like %(txt)s)
		order by pv.name desc
		limit %(page_len)s offset %(start)s
		""",
		{
			"registration_category": registration_category,
			"txt": f"%{txt}%",
			"start": start,
			"page_len": page_len,
		},
	)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def op_id_query(doctype, txt, searchfield, start, page_len, filters):
	return _visit_id_query("OP", txt, start, page_len)


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def ip_id_query(doctype, txt, searchfield, start, page_len, filters):
	return _visit_id_query("IP", txt, start, page_len)


@frappe.whitelist()
def get_ip_id_for_op(op_id):
	# Typing the OP ID should surface the IP admission on its own once that
	# OP visit has actually been converted - staff shouldn't have to already
	# know the IP number by heart to look it up.
	frappe.has_permission("Billing", "read", throw=True)
	if not op_id:
		return None
	return frappe.db.get_value("Patient Visit", {"converted_from_registration": op_id}, "name")


@frappe.whitelist()
def get_op_id_for_ip(ip_id):
	# Mirrors get_ip_id_for_op() in reverse - typing the IP ID directly
	# (the common case for IP billing) still surfaces the OP visit it came
	# from, for reference, without staff having to go find it themselves.
	frappe.has_permission("Billing", "read", throw=True)
	if not ip_id:
		return None
	return frappe.db.get_value("Patient Visit", ip_id, "converted_from_registration")


@frappe.whitelist()
def get_patient_name(patient):
	# Patient Visit doesn't carry the patient's actual name itself -
	# only a link (uhin_id) to the demographics record that does.
	frappe.has_permission("Billing", "read", throw=True)
	if not patient:
		return ""
	uhin_id = frappe.db.get_value("Patient Visit", patient, "uhin_id")
	if not uhin_id:
		return ""
	registration = frappe.db.get_value(
		"Patient Registration", uhin_id, ["patient_name", "first_name", "last_name"], as_dict=True
	)
	if not registration:
		return ""
	if registration.patient_name:
		return registration.patient_name
	# Full Name is always derived from First/Last Name on save, but an older
	# record saved before that rule existed could still have it blank - fall
	# back to building it from those rather than surfacing a name that's
	# technically on file but just wasn't copied into this one field.
	return " ".join(filter(None, [registration.first_name, registration.last_name]))
