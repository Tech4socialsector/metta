import traceback

import frappe
from frappe.utils import today, now_datetime

RESULTS = []


def step(label, fn):
	try:
		result = fn()
		RESULTS.append((label, "OK", ""))
		print(f"[OK] {label}" + (f" -> {result}" if result else ""))
		return result
	except Exception as e:
		RESULTS.append((label, "FAIL", str(e)))
		print(f"[FAIL] {label} -> {e}")
		print(traceback.format_exc()[-1500:])
		return None


def run():
	frappe.set_user("Administrator")

	# ---------- PHASE 1: Foundational masters ----------
	for grp in ["Pharmacy Store", "General Store"]:
		if not frappe.db.exists("Item Group", grp):
			step(f"Item Group: {grp}", lambda g=grp: frappe.get_doc({"doctype": "Item Group", "group_name": g}).insert(ignore_permissions=True).name)

	cats = [
		("Tablets", "Pharmacy Store", "Medicine"),
		("Consumables", "Pharmacy Store", "Consumable"),
		("Registration", "General Store", "Service"),
		("Admission", "General Store", "Service"),
		("Laboratory", "General Store", "Service"),
		("X-Ray", "General Store", "Service"),
		("Nursing", "General Store", "Service"),
	]
	for cat, grp, behaves in cats:
		if not frappe.db.exists("Item Category", cat):
			step(f"Item Category: {cat}", lambda c=cat, g=grp, b=behaves: frappe.get_doc(
				{"doctype": "Item Category", "category_name": c, "item_group": g, "behaves_as": b}
			).insert(ignore_permissions=True).name)

	if not frappe.db.exists("HSN Master", "3004"):
		step("HSN Master", lambda: frappe.get_doc({"doctype": "HSN Master", "hsn_code": "3004", "gst_percent": 12}).insert(ignore_permissions=True).name)

	for wh, wtype in [("Central Store", "Central Store"), ("Pharmacy", "Pharmacy")]:
		if not frappe.db.exists("Warehouse", wh):
			step(f"Warehouse: {wh}", lambda w=wh, t=wtype: frappe.get_doc({"doctype": "Warehouse", "warehouse_name": w, "warehouse_type": t}).insert(ignore_permissions=True).name)

	if not frappe.db.exists("Ward Master", "General Ward"):
		def _ward():
			d = frappe.get_doc({"doctype": "Ward Master", "total_beds": 10})
			d.name = "General Ward"
			d.insert(ignore_permissions=True, set_name="General Ward")
			return d.name
		step("Ward Master", _ward)

	if not frappe.db.exists("Department", "General Medicine"):
		def _dept():
			d = frappe.get_doc({"doctype": "Department"})
			d.insert(ignore_permissions=True, set_name="General Medicine")
			return d.name
		step("Department", _dept)

	if not frappe.db.exists("Doctor Master", "Dr Test Kumar"):
		def _doc_master():
			d = frappe.get_doc({"doctype": "Doctor Master", "department": "General Medicine", "fee_amount": 500})
			d.insert(ignore_permissions=True, set_name="Dr Test Kumar")
			return d.name
		step("Doctor Master", _doc_master)

	if not frappe.db.exists("Registration type Master", "New Registration"):
		def _reg_type():
			d = frappe.get_doc({"doctype": "Registration type Master", "fee_amount": 500})
			d.insert(ignore_permissions=True, set_name="New Registration")
			return d.name
		step("Registration type Master", _reg_type)

	if not frappe.db.exists("Supplier", "Test Pharma Distributors"):
		step("Supplier", lambda: frappe.get_doc({"doctype": "Supplier", "supplier_name": "Test Pharma Distributors"}).insert(ignore_permissions=True).name)

	print("\n=== PHASE 1 DONE ===\n")

	# ---------- PHASE 2: Items ----------
	if not frappe.db.exists("Item", "TEST-PARA-500"):
		step("Item: Paracetamol (Medicine)", lambda: frappe.get_doc({
			"doctype": "Item", "item_code": "TEST-PARA-500", "item_name": "Test Paracetamol 500mg",
			"item_group": "Pharmacy Store", "category": "Tablets", "hsn_code": "3004",
		}).insert(ignore_permissions=True).name)

	if not frappe.db.exists("Item", "TEST-OP-FEE"):
		step("Item: OP Consultation (Service)", lambda: frappe.get_doc({
			"doctype": "Item", "item_code": "TEST-OP-FEE", "item_name": "Test OP Consultation Fee",
			"item_group": "General Store", "category": "Registration",
		}).insert(ignore_permissions=True).name)

	if not frappe.db.exists("Item", "TEST-CBC"):
		step("Item: CBC Test (Service)", lambda: frappe.get_doc({
			"doctype": "Item", "item_code": "TEST-CBC", "item_name": "Test CBC",
			"item_group": "General Store", "category": "Laboratory",
		}).insert(ignore_permissions=True).name)

	if not frappe.db.exists("Item", "TEST-IP-ADMISSION"):
		step("Item: IP Admission Charge (Service)", lambda: frappe.get_doc({
			"doctype": "Item", "item_code": "TEST-IP-ADMISSION", "item_name": "Test IP Admission Charge",
			"item_group": "General Store", "category": "Admission",
		}).insert(ignore_permissions=True).name)

	item = frappe.get_doc("Item", "TEST-PARA-500")
	print("Paracetamol item_type auto-derived:", item.item_type, "| has_batch:", item.has_batch)

	print("\n=== PHASE 2 DONE ===\n")

	# ---------- PHASE 3: Service Rate List ----------
	for item_code, rate in [("TEST-OP-FEE", 500), ("TEST-CBC", 300), ("TEST-IP-ADMISSION", 100)]:
		if not frappe.db.exists("Service Rate List", item_code):
			step(f"Service Rate List: {item_code}", lambda i=item_code, r=rate: frappe.get_doc(
				{"doctype": "Service Rate List", "item": i, "current_rate": r, "start_date": today()}
			).insert(ignore_permissions=True).name)

	item = frappe.get_doc("Item", "TEST-OP-FEE")
	print("TEST-OP-FEE standard_selling_rate after Service Rate List:", item.standard_selling_rate)

	print("\n=== PHASE 3 DONE ===\n")

	# ---------- PHASE 4: Purchase flow for Paracetamol ----------
	po = step("Purchase Order", lambda: frappe.get_doc({
		"doctype": "Purchase Order",
		"supplier": "Test Pharma Distributors",
		"items": [{"item": "TEST-PARA-500", "packing": 1, "no_of_unit": 100, "qty_ordered": 100, "rate": 2}],
	}).insert(ignore_permissions=True))
	if po:
		step("Submit Purchase Order", lambda: po.submit())

	pr = None
	if po:
		pr = step("Purchase Receipt", lambda: frappe.get_doc({
			"doctype": "Purchase Receipt",
			"supplier": "Test Pharma Distributors",
			"purchase_order": po.name,
			"receiving_warehouse": "Central Store",
			"items": [{
				"item": "TEST-PARA-500", "packing": 1, "no_of_unit": 100, "qty_ordered": 100, "qty_received": 100,
				"batch_no": "TESTBATCH-001", "expiry_date": "2027-12-31",
			}],
		}).insert(ignore_permissions=True))
		if pr:
			step("Submit Purchase Receipt", lambda: pr.submit())

	pb = None
	if pr:
		pb = step("Purchase Bill", lambda: frappe.get_doc({
			"doctype": "Purchase Bill",
			"supplier": "Test Pharma Distributors",
			"purchase_receipt": pr.name,
			"supplier_invoice_no": "TESTINV-001",
			"supplier_invoice_date": today(),
			"items": [{"item": "TEST-PARA-500", "batch_no": "TESTBATCH-001", "packing": 1, "no_of_unit": 100, "qty": 100, "purchase_rate": 2}],
		}).insert(ignore_permissions=True))
		if pb:
			step("Submit Purchase Bill", lambda: pb.submit())
			step("Approve Purchase Bill", lambda: pb.run_method("approve_bill"))

	print("\n=== PHASE 4 DONE ===\n")

	# ---------- PHASE 5: Stock Transfer to Pharmacy ----------
	batch_name = frappe.db.get_value("Batch", {"item": "TEST-PARA-500"}, "name")
	# Real usage has MRP entered on the Purchase Bill row, which then feeds
	# the Batch's own selling_rate - skipped in this quick test purchase, so
	# it's patched directly here to something billable.
	if batch_name:
		frappe.db.set_value("Batch", batch_name, "selling_rate", 3)

	st = step("Stock Transfer (Central Store -> Pharmacy)", lambda: frappe.get_doc({
		"doctype": "Stock Transfer",
		"from_warehouse": "Central Store",
		"to_warehouse": "Pharmacy",
		"dispatch_date_time": today(),
		"issued_by": "Administrator",
		"status": "Draft",
		"items": [{"item": "TEST-PARA-500", "batch": batch_name, "qty_dispatched": 50}],
	}).insert(ignore_permissions=True))
	if st:
		step("Submit Stock Transfer", lambda: st.submit())

		def _confirm():
			st.items[0].qty_confirmed = st.items[0].qty_dispatched
			st.run_method("confirm_receipt")
			return st.status
		step("Confirm Stock Transfer Receipt", _confirm)

	print("\n=== PHASE 5 DONE ===\n")
	frappe.db.commit()

	# ---------- PHASE 6: Patient flow (OP -> billing -> admission -> IP -> discharge) ----------
	patient_reg = step("Patient Registration", lambda: frappe.get_doc({
		"doctype": "Patient Registration", "first_name": "E2E", "last_name": "TestPatient", "sex": "Male",
		"dob": "1990-01-01", "phone": "9999911111",
	}).insert(ignore_permissions=True))

	op_visit = None
	if patient_reg:
		op_visit = step("OP Patient Visit", lambda: frappe.get_doc({
			"doctype": "Patient Visit", "registration_category": "OP", "uhin_id": patient_reg.name,
			"billing_category": "General", "doctor_name": "Dr Test Kumar",
		}).insert(ignore_permissions=True))

	if op_visit:
		ni_name = frappe.db.get_value("Nurse Interventions", {"patient_registration": op_visit.name}, "name")
		print("Auto-created Nurse Interventions on OP visit:", ni_name)
		if ni_name:
			def _complete_ni():
				ni = frappe.get_doc("Nurse Interventions", ni_name)
				ni.status = "Completed"
				ni.temperature = "98.6"
				ni.pulse = "72"
				ni.respiration = "18"
				ni.saturation = "98"
				ni.blood_pressure_mmhg = "120/80"
				ni.save(ignore_permissions=True)
				return ni.name
			step("Complete Nurse Interventions (vitals)", _complete_ni)

	op_bill = None
	if op_visit:
		op_bill = step("OP Billing (Service)", lambda: frappe.get_doc({
			"doctype": "Billing", "bill_type": "Service", "op_id": op_visit.name, "patient": op_visit.name,
			"customer_name": "E2E TestPatient", "billing_category": "General",
			"service_items": [{"item": "TEST-OP-FEE", "item_name": "Test OP Consultation Fee", "item_type": "Service", "qty": 1, "rate": 500}],
			"payment_mode": "Cash",
		}).insert(ignore_permissions=True))
		if op_bill:
			step("Submit OP Billing", lambda: op_bill.submit())

	ip_visit = None
	if op_visit:
		ip_visit = step("Admit to IP", lambda: frappe.get_doc({
			"doctype": "Patient Visit", "registration_category": "IP", "uhin_id": patient_reg.name,
			"converted_from_registration": op_visit.name, "billing_category": "General",
			"doctor_name": "Dr Test Kumar", "accommodation_type": "Ward", "ward": "General Ward", "bed_no": "E2E-1",
			"admission_status": "Admitted",
		}).insert(ignore_permissions=True))

	advance = None
	if ip_visit:
		advance = step("Patient Advance", lambda: frappe.get_doc({
			"doctype": "Patient Advance", "patient_visit": ip_visit.name, "patient_name": "E2E TestPatient",
			"amount": 1000, "payment_mode": "Cash", "received_by": "Administrator",
		}).insert(ignore_permissions=True))

	ip_bill = None
	if ip_visit:
		ip_bill = step("IP Billing (Mixed - pharmacy + service)", lambda: frappe.get_doc({
			"doctype": "Billing", "bill_type": "Mixed", "ip_id": ip_visit.name, "op_id": op_visit.name,
			"patient": ip_visit.name, "customer_name": "E2E TestPatient", "billing_category": "General",
			"pharmacy_items": [{"item": "TEST-PARA-500", "item_name": "Test Paracetamol 500mg", "item_type": "Medicine", "qty": 5, "rate": 3, "batch_no": batch_name}],
			"service_items": [{"item": "TEST-CBC", "item_name": "Test CBC", "item_type": "Service", "qty": 1, "rate": 300}],
			"payment_mode": "Cash", "advance_adjusted": 300,
		}).insert(ignore_permissions=True))
		if ip_bill:
			step("Submit IP Billing", lambda: ip_bill.submit())

	if ip_visit:
		def _discharge():
			v = frappe.get_doc("Patient Visit", ip_visit.name)
			v.admission_status = "Discharged"
			v.save(ignore_permissions=True)
			return v.discharge_date
		step("Discharge IP Visit (as System Manager/Doctor)", _discharge)

	discharge_summary = None
	if ip_visit:
		discharge_summary = step("Discharge Summary", lambda: frappe.get_doc({
			"doctype": "Discharge Summary", "patient_visit": ip_visit.name,
			"care_department": "Medicine", "diagnosis_at_discharge": "Test diagnosis",
			"condition_at_discharge": "Improved",
		}).insert(ignore_permissions=True))

	if ip_visit and discharge_summary:
		db_bill = step("Discharge Bill", lambda: frappe.get_doc({
			"doctype": "Discharge Bill", "ip_id": ip_visit.name,
		}).insert(ignore_permissions=True))
		print("Discharge Bill total_billed:", db_bill.total_billed if db_bill else None)

	print("\n=== PHASE 6 DONE ===\n")
	frappe.db.commit()

	# ---------- PHASE 7: Sales Return ----------
	if op_bill:
		sr = step("Sales Return", lambda: frappe.get_doc({
			"doctype": "Sales Return", "patient": op_visit.name, "against_sales_bill": op_bill.name,
			"to_warehouse": "Pharmacy", "returned_by": "Administrator", "payment_mode": "Cash",
			"items": [{"item": "TEST-PARA-500", "item_name": "Test Paracetamol 500mg", "batch": batch_name, "qty_returned": 1, "rate": 3, "return_reason": "Not Required"}],
		}).insert(ignore_permissions=True))
		if sr:
			step("Submit Sales Return", lambda: sr.submit())

	print("\n=== PHASE 7 DONE ===\n")

	# ---------- PHASE 8: Reports ----------
	from metta.sales.page.daily_collection_report.daily_collection_report import get_data
	step("Daily Collection Report get_data()", lambda: get_data(today(), today()))

	print("\n=== PHASE 8 DONE ===\n")

	print("\n\n========== SUMMARY ==========")
	for label, status, msg in RESULTS:
		print(f"{status:5} | {label}" + (f" | {msg}" if status == "FAIL" else ""))
	fails = [r for r in RESULTS if r[1] == "FAIL"]
	print(f"\n{len(RESULTS) - len(fails)} passed, {len(fails)} failed out of {len(RESULTS)}")


if __name__ == "__main__":
	run()
