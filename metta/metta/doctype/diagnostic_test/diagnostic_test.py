# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from dateutil.relativedelta import relativedelta
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, cint, flt, getdate, now_datetime

# The forward path of a test. Cancelled sits outside it and can be reached
# from any step before Reported.
FLOW = ["Ordered", "Sample Collected", "Result Entered", "Reported"]
VERIFIER_ROLES = ("Lab Verifier", "System Manager")
LOCKED = ("Reported", "Cancelled")


class DiagnosticTest(Document):
	def validate(self):
		self.set_patient_details()
		self.set_template()
		self.set_result_rows()
		self.set_paid()
		self.validate_status_change()
		self.set_flags()

		# Recorded the first time status actually reaches Reported - not reset
		# on later edits, so it keeps showing who originally reported it even
		# if someone else corrects a typo in the result afterwards. Same
		# "stamp once" pattern as collected_by on Patient Visit.
		if self.status == "Reported" and not self.reported_by:
			self.reported_by = frappe.session.user
			self.reported_on = now_datetime()

	def set_patient_details(self):
		# Lab Staff can't read Patient Visit, and the normal range depends on
		# sex and age, so keep both on the test itself.
		if not self.patient_visit:
			self.patient_visit = frappe.db.get_value(
				"Doctor Consultation", self.doctor_consultation, "patient_consultation"
			)
		if self.patient_visit and (not self.sex or not self.age):
			visit = frappe.db.get_value("Patient Visit", self.patient_visit, ["sex", "age", "dob"], as_dict=True) or {}
			self.sex = visit.get("sex")
			# Age from date of birth when there is one: the stored age is text
			# and was right only on the day of the visit.
			if visit.get("dob"):
				self.age = str(relativedelta(getdate(), getdate(visit.dob)).years)
			else:
				self.age = visit.get("age")

	def set_template(self):
		if not self.lab_test_template and self.item:
			self.lab_test_template = frappe.db.get_value(
				"Lab Test Template", {"item": self.item, "is_active": 1}, "name"
			)

	def set_result_rows(self):
		# Rows are made once, from the template, before results are entered.
		# Later edits to the template don't touch a test already in progress.
		if not self.lab_test_template or self.results or self.status not in ("Ordered", "Sample Collected"):
			return
		template = frappe.get_cached_doc("Lab Test Template", self.lab_test_template)
		if template.result_type == "Text only":
			return

		age = cint((self.age or "").split(" ")[0]) if self.age else None
		child_limit = cint(frappe.db.get_single_value("Lab Settings", "child_age_limit")) or 12
		if age is not None and age < child_limit:
			band = "child"
		elif self.sex == "Female":
			band = "female"
		else:
			band = "male"

		for p in template.parameters:
			low, high = flt(p.get(band + "_low")), flt(p.get(band + "_high"))
			# A child range left blank falls back to the adult range for the sex.
			if band == "child" and not (low or high):
				adult = "female" if self.sex == "Female" else "male"
				low, high = flt(p.get(adult + "_low")), flt(p.get(adult + "_high"))
			self.append(
				"results",
				{
					"parameter": p.parameter,
					"unit": p.unit,
					"value_type": p.value_type,
					"normal_text": p.normal_text,
					"low": low,
					"high": high,
					"critical_low": p.critical_low,
					"critical_high": p.critical_high,
					"normal_range": range_text(p.value_type, low, high, p.normal_text),
				},
			)

	def set_paid(self):
		# Paid means a submitted Billing for this consultation (or, failing that,
		# this visit after the order) carries this test's item as a service row.
		# Checked again on every save until the sample is taken.
		if self.is_paid or self.status not in ("Ordered",):
			return
		bill = find_paid_bill(self)
		if bill:
			self.is_paid = 1
			self.billing = bill

	def validate_status_change(self):
		before = self.get_doc_before_save()
		old = before.status if before else None

		if not before and self.status != "Ordered":
			frappe.throw(_("A new test starts as Ordered."))

		if before and old in LOCKED:
			if self.status != old:
				frappe.throw(_("A {0} test can't be moved to another status.").format(old))
			if results_changed(before, self):
				frappe.throw(_("This test is {0}; its results can't be changed.").format(old))
			return

		# No result can exist before the sample is taken.
		if self.status == "Ordered" and any((r.result_value or "").strip() for r in self.results):
			frappe.throw(_("Mark the sample collected before entering results."))

		if not before or self.status == old:
			return

		if self.status == "Cancelled":
			if not (self.cancel_reason or "").strip():
				frappe.throw(_("Enter a Cancel Reason."))
			return

		# One step at a time, so payment, results and verification are never skipped.
		expected = FLOW[FLOW.index(old) + 1]
		if self.status != expected:
			frappe.throw(_("The next step after {0} is {1}.").format(old, expected))

		if self.status == "Sample Collected":
			if cint(frappe.db.get_single_value("Lab Settings", "pay_before_sample")) and not self.is_paid:
				frappe.throw(_("This test is not paid yet. The patient must pay at Billing before the sample is taken."))
			if not self.sample_collected_on:
				self.sample_collected_on = now_datetime()
			# The result is due turnaround-hours after collection; the worklist's
			# Late tab and the reports read this.
			hours = self.lab_test_template and frappe.db.get_value(
				"Lab Test Template", self.lab_test_template, "turnaround_hours"
			)
			if hours:
				self.due_on = add_to_date(self.sample_collected_on, hours=cint(hours))

		elif self.status == "Result Entered":
			if self.results:
				empty = [r.parameter for r in self.results if not (r.result_value or "").strip()]
				if empty:
					frappe.throw(_("Enter a result for: {0}").format(", ".join(empty)))
			elif not ((self.result or "").strip() or self.result_attachment):
				frappe.throw(_("Enter a result or attach the report first."))
			self.result_entered_by = frappe.session.user
			self.result_entered_on = now_datetime()

		elif self.status == "Reported":
			# Lab tests are checked by a second person before the doctor sees
			# them. X-Ray / Scan / Other keep the old one-person flow.
			if self.test_type == "Lab Test":
				if not set(VERIFIER_ROLES) & set(frappe.get_roles()):
					frappe.throw(_("Only a Lab Verifier can verify and report a lab test."))
				same_ok = cint(frappe.db.get_single_value("Lab Settings", "allow_same_person_verify"))
				if not same_ok and self.result_entered_by == frappe.session.user:
					frappe.throw(_("The person who entered the result can't verify it. Ask another Lab Verifier."))
			self.verified_by = frappe.session.user
			self.verified_on = now_datetime()

	def set_flags(self):
		for r in self.results:
			r.flag = result_flag(r)


def range_text(value_type, low, high, normal_text):
	if value_type != "Number":
		return normal_text or ""
	if low and high:
		return f"{low:g} - {high:g}"
	if high:
		return f"< {high:g}"
	if low:
		return f"> {low:g}"
	return ""


def result_flag(r):
	value = (r.result_value or "").strip()
	if not value:
		return ""
	# A result that can be judged and passes shows "Normal" (user, 2026-10-28),
	# so the lab and doctor see it was checked; with nothing to judge against
	# (no normal value / no range set) the flag stays empty.
	if r.value_type != "Number":
		if not r.normal_text:
			return ""
		return "Normal" if value.lower() == r.normal_text.strip().lower() else "Abnormal"
	try:
		v = float(value)
	except ValueError:
		return ""
	# Critical first: it matters more than plain low/high. 0 means "not set".
	if r.critical_low and v < r.critical_low:
		return "Critical Low"
	if r.critical_high and v > r.critical_high:
		return "Critical High"
	if r.low and v < r.low:
		return "Low"
	if r.high and v > r.high:
		return "High"
	return "Normal" if (r.low or r.high or r.critical_low or r.critical_high) else ""


def results_changed(before, doc):
	old = [(r.parameter, (r.result_value or "").strip()) for r in before.results]
	new = [(r.parameter, (r.result_value or "").strip()) for r in doc.results]
	return old != new or (before.result or "") != (doc.result or "")


@frappe.whitelist()
def get_collection_queue(patient_visit=None):
	"""Paid tests still waiting for their sample, one group per patient, with
	the tube to use - the Lab's "Collect samples" list (Desk and Vue)."""
	frappe.has_permission("Diagnostic Test", "write", throw=True)
	filters = {"status": "Ordered", "is_paid": 1}
	if patient_visit:
		filters["patient_visit"] = patient_visit
	tests = frappe.get_all(
		"Diagnostic Test",
		filters=filters,
		fields=["name", "item_name", "test_type", "patient_visit", "patient_name", "lab_test_template", "ordered_on"],
		order_by="ordered_on asc",
	)
	templates = {t.lab_test_template for t in tests if t.lab_test_template}
	sample_of = dict(
		frappe.get_all(
			"Lab Test Template", filters={"name": ["in", list(templates)]}, fields=["name", "sample_type"], as_list=True
		)
	) if templates else {}
	types = {s for s in sample_of.values() if s}
	type_info = {
		s.name: s
		for s in frappe.get_all(
			"Lab Sample Type", filters={"name": ["in", list(types)]}, fields=["name", "container", "tube_colour", "volume"]
		)
	} if types else {}

	groups = {}
	for t in tests:
		g = groups.setdefault(
			t.patient_visit, {"patient_visit": t.patient_visit, "patient_name": t.patient_name, "tests": []}
		)
		st = sample_of.get(t.lab_test_template)
		info = type_info.get(st) or {}
		g["tests"].append(
			{
				"name": t.name,
				"item_name": t.item_name,
				"test_type": t.test_type,
				"sample_type": st,
				"container": info.get("container"),
				"tube_colour": info.get("tube_colour"),
				"volume": info.get("volume"),
			}
		)
	return list(groups.values())


@frappe.whitelist()
def collect_samples(tests):
	"""Take the samples for these tests in one go: one Lab Sample (one tube,
	one ID) per patient and sample type, and each test moves to Sample
	Collected through its own save, so every rule in validate() still runs.
	All or nothing - the request rolls back if any test is refused."""
	tests = frappe.parse_json(tests) if isinstance(tests, str) else tests
	if not tests:
		frappe.throw(_("Pick at least one test."))

	docs = [frappe.get_doc("Diagnostic Test", name) for name in tests]
	samples = {}
	for doc in docs:
		doc.check_permission("write")
		if doc.status != "Ordered":
			frappe.throw(_("{0} is already {1}.").format(doc.name, doc.status))
		# Tests made before the lab upgrade may not carry the visit yet.
		doc.set_patient_details()
		doc.set_template()
		sample_type = doc.lab_test_template and frappe.db.get_value(
			"Lab Test Template", doc.lab_test_template, "sample_type"
		)
		# X-Ray / Scan and tests without a sample type have no tube to label.
		if sample_type:
			key = (doc.patient_visit, sample_type)
			if key not in samples:
				samples[key] = frappe.get_doc(
					{"doctype": "Lab Sample", "patient_visit": doc.patient_visit, "sample_type": sample_type}
				).insert()
			doc.lab_sample = samples[key].name
		doc.status = "Sample Collected"
		doc.save()

	return [{"sample": s.name, "sample_type": s.sample_type, "patient_name": s.patient_name} for s in samples.values()]


def update_paid_from_bill(bill, method=None):
	# Called from Billing submit / cancel (hooks.py doc_events), so the lab sees
	# "Paid" without anyone re-saving the test.
	items = {r.item for r in bill.get("service_items") or []}
	if not items:
		return
	filters = {"item": ["in", list(items)], "status": "Ordered"}
	if method == "on_cancel":
		# Only tests this bill had paid for go back to unpaid.
		names = frappe.get_all("Diagnostic Test", filters={**filters, "billing": bill.name}, pluck="name")
		for name in names:
			frappe.db.set_value("Diagnostic Test", name, {"is_paid": 0, "billing": None})
		return

	visit = bill.patient or bill.ip_id or bill.op_id
	candidates = frappe.get_all(
		"Diagnostic Test",
		filters={**filters, "is_paid": 0},
		or_filters=[
			["doctor_consultation", "=", bill.doctor_consultation or ""],
			["patient_visit", "=", visit or ""],
		],
		pluck="name",
	)
	for name in candidates:
		doc = frappe.get_doc("Diagnostic Test", name)
		found = find_paid_bill(doc)
		if found:
			# set_value, not save: no status change happens here, and Billing
			# staff don't need write access to Diagnostic Test.
			frappe.db.set_value("Diagnostic Test", name, {"is_paid": 1, "billing": found})


def find_paid_bill(doc):
	bills = frappe.get_all(
		"Billing", filters={"doctor_consultation": doc.doctor_consultation, "docstatus": 1}, pluck="name"
	)
	if not bills and doc.patient_visit:
		# IP and other bills made from the patient, not the consultation.
		filters = {"docstatus": 1}
		if doc.ordered_on:
			filters["sale_datetime"] = [">=", doc.ordered_on]
		bills = frappe.get_all(
			"Billing",
			filters=filters,
			or_filters={"patient": doc.patient_visit, "ip_id": doc.patient_visit, "op_id": doc.patient_visit},
			pluck="name",
		)
	if not bills:
		return None
	rows = frappe.get_all(
		"Sales Bill Item",
		filters={"parenttype": "Billing", "parentfield": "service_items", "parent": ["in", bills], "item": doc.item},
		pluck="parent",
		limit=1,
	)
	return rows[0] if rows else None


def get_permission_query_conditions(user=None):
	# A Doctor only ever needs tests ordered from their own consultations -
	# Lab Staff and System Manager see everything, same shape as the
	# Doctor-scoping already used on Patient Visit/Doctor Consultation/Appointment.
	user = user or frappe.session.user
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Lab Staff" in roles or "Lab Verifier" in roles or "Doctor" not in roles:
		return ""

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return "1=0"
	return f"""`tabDiagnostic Test`.doctor_consultation in (
		select name from `tabDoctor Consultation` where doctor = {frappe.db.escape(doctor)}
	)"""


def has_permission(doc, ptype, user):
	roles = frappe.get_roles(user)
	if "System Manager" in roles or "Lab Staff" in roles or "Lab Verifier" in roles or "Doctor" not in roles:
		return True

	# Opening a Form directly by URL passes just the docname, not a loaded
	# Document - every other caller already passes the doc, so this only
	# ever does the extra fetch on that one path.
	if isinstance(doc, (str, int)):
		doc = frappe.get_doc("Diagnostic Test", doc)

	doctor = frappe.db.get_value("Doctor Master", {"user": user}, "name")
	if not doctor:
		return False
	consultation_doctor = frappe.db.get_value("Doctor Consultation", doc.doctor_consultation, "doctor")
	return consultation_doctor == doctor
