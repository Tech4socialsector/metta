# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from metta.stock.doctype.stock_ledger_entry.stock_ledger_entry import (
	create_stock_ledger_entry,
	reverse_stock_ledger_entries,
	validate_sufficient_stock,
)


class Billing(Document):
	def validate(self):
		self.validate_warehouse()
		self.update_bill_type()

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

		subtotal = 0
		gst_total = 0
		for row in self.items:
			row.amount = flt(row.qty) * flt(row.rate)
			taxable_value = row.amount * (1 - signed_percent / 100)
			row.gst_amount = taxable_value * flt(row.gst_percent) / 100
			subtotal += row.amount
			gst_total += row.gst_amount
		self.subtotal = subtotal
		# discount_amount stays signed too, so the same subtraction below
		# works for both directions: positive shrinks net_amount (Discount),
		# negative grows it (Increase).
		self.discount_amount = subtotal * signed_percent / 100
		self.gst_amount = gst_total
		self.net_amount = subtotal - self.discount_amount + gst_total

		self.apply_charity()

	def apply_charity(self):
		# Charity is a full waiver, not a discount - what the patient would
		# otherwise have owed is recorded (for the collection report) and then
		# zeroed out, rather than left to just silently disappear.
		if self.payment_mode == "Charity":
			if not self.charity_category:
				frappe.throw(_("Charity Category is mandatory when Payment Mode is Charity."))
			self.charity_amount = self.net_amount
			self.net_amount = 0
		else:
			self.charity_category = None
			self.charity_amount = 0
			self.charity_remarks = None

	def update_bill_type(self):
		# Whatever was picked before adding items (to drive the Item picker's
		# filter in the browser) is only a starting point - this is the
		# authoritative recompute from what's actually on the bill, so the
		# stored value is always correct for the collection report's Pharmacy
		# vs Service split, not just whatever was selected first.
		item_types = {row.item_type for row in self.items if row.item_type}
		pharmacy_types = {"Medicine", "Consumable"}
		if not item_types:
			return
		if item_types <= pharmacy_types:
			self.bill_type = "Pharmacy"
		elif item_types == {"Service"}:
			self.bill_type = "Service"
		else:
			self.bill_type = "Mixed"

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
		for row in self.items:
			# A Service (a lab test, an X-ray, a consultation fee) was never
			# stocked in the first place - forcing it through the same
			# stock-ledger/sufficient-stock check as a physical Medicine or
			# Consumable would always fail with "0 available", since no Item
			# of this type ever has a Stock Balance row.
			if row.item_type == "Service":
				continue

			row.stock_qty = flt(row.qty) * flt(row.conversion_factor or 1)
			row.db_set("stock_qty", row.stock_qty, update_modified=False)
			validate_sufficient_stock(row.item, self.warehouse, row.stock_qty)

			create_stock_ledger_entry(
				item=row.item,
				warehouse=self.warehouse,
				batch_no=row.batch_no,
				posting_datetime=self.sale_datetime,
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


def _billing_row(item_code, item_name, qty):
	item_details = frappe.db.get_value(
		"Item", item_code, ["sale_uom", "standard_selling_rate", "gst_percent"], as_dict=True
	) or frappe._dict()
	rate = flt(item_details.standard_selling_rate)
	return {
		"item": item_code,
		"item_name": item_name,
		"qty": flt(qty),
		"uom": item_details.sale_uom or "",
		"rate": rate,
		"gst_percent": flt(item_details.gst_percent),
		"amount": rate * flt(qty),
	}


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

	# Known from which list each came from (prescribed_items is always
	# Medicine, suggested_tests is always Service - see the query filters on
	# Doctor Consultation) rather than re-checking each item's own type here -
	# update_bill_type() on save still re-derives this authoritatively from
	# what's actually on the bill either way.
	if medicines and tests:
		bill_type = "Mixed"
	elif medicines:
		bill_type = "Pharmacy"
	else:
		bill_type = "Service"

	return {
		"patient": consult.patient_consultation,
		"doctor": consult.doctor,
		"billing_category": billing_category,
		"bill_type": bill_type,
		"items": medicines + tests,
	}


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
		"Patient Registration", uhin_id, ["patient_name", "first_name", "middle_name", "last_name"], as_dict=True
	)
	if not registration:
		return ""
	if registration.patient_name:
		return registration.patient_name
	# "Full Name" is a separate, manually-entered field - it's easy for it to
	# be left blank even when First/Last Name were filled in, so fall back to
	# building it from those rather than surfacing a name that's technically
	# on file but just wasn't copied into this one field.
	return " ".join(filter(None, [registration.first_name, registration.middle_name, registration.last_name]))
