# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, flt, getdate, nowdate

SUBSIDY_STAFF_CATEGORIES = ["Staff", "Staff Dependent"]


def _payment_modes():
	# Reads the real Select options off the Billing doctype itself rather
	# than hardcoding them here, so this stays correct if someone edits the
	# payment_mode field's options later.
	options = frappe.get_meta("Billing").get_field("payment_mode").options or ""
	return [o for o in options.split("\n") if o]


def _resolve_range(from_date, to_date):
	# No date typed in yet (fresh page load, or Clear was just clicked) -
	# default to a rolling 90-day window rather than "today only", so the
	# page shows real recent activity instead of a wall of zeros the moment
	# nothing happened to be entered on today's exact calendar date.
	to_date = getdate(to_date) if to_date else getdate(nowdate())
	from_date = getdate(from_date) if from_date else add_days(to_date, -90)
	return from_date, to_date


def _dt_between(fieldname, from_date, to_date):
	# Datetime/Date fields both accept "YYYY-MM-DD HH:MM:SS" bounds for "between".
	return [fieldname, "between", [f"{from_date} 00:00:00", f"{to_date} 23:59:59"]]


@frappe.whitelist()
def get_doctors():
	frappe.has_permission("Doctor Master", "read", throw=True)
	return frappe.get_all("Doctor Master", pluck="name", order_by="name")


@frappe.whitelist()
def get_categories():
	frappe.has_permission("Category Price Adjustment", "read", throw=True)
	return frappe.get_all("Category Price Adjustment", pluck="name", order_by="name")


@frappe.whitelist()
def get_dashboard_data(from_date=None, to_date=None, doctor=None, category=None):
	# One call for the whole page - the sections below read very different
	# doctypes, but a leadership dashboard is scanned as one screen, so it
	# should also load as one round trip rather than a tile-per-request.
	frappe.has_permission("Patient Visit", "read", throw=True)

	from_date, to_date = _resolve_range(from_date, to_date)
	is_single_day = from_date == to_date

	data = {}
	data["range"] = {"from_date": str(from_date), "to_date": str(to_date)}
	data.update(_patient_volume(from_date, to_date, is_single_day))
	data.update(_clinical_flow(from_date, to_date, doctor))
	data["doctor_table"] = _doctor_table(from_date, to_date)
	data.update(_admission_discharge(from_date, to_date))
	data.update(_billing(from_date, to_date, category))
	data["patient_mix"] = _patient_mix(from_date, to_date)
	return data


def _patient_volume(from_date, to_date, is_single_day):
	reg_filters = [_dt_between("creation", from_date, to_date)]
	registered_count = frappe.db.count("Patient Registration", filters=reg_filters)

	delta = None
	if is_single_day:
		yesterday = add_days(from_date, -1)
		delta = frappe.db.count("Patient Registration", filters=[_dt_between("creation", yesterday, yesterday)])

	visits = frappe.get_all(
		"Patient Visit",
		filters=[_dt_between("creation", from_date, to_date)],
		fields=["registration_category"],
	)
	op_count = sum(1 for v in visits if v.registration_category == "OP")
	ip_count = sum(1 for v in visits if v.registration_category == "IP")

	currently_admitted = frappe.db.count("Patient Visit", filters={"admission_status": "Admitted"})

	return {
		"registered_count": registered_count,
		"registered_delta": (registered_count - delta) if delta is not None else None,
		"visits_total": len(visits),
		"visits_op": op_count,
		"visits_ip": ip_count,
		"currently_admitted": currently_admitted,
	}


def _clinical_flow(from_date, to_date, doctor):
	nurse_rows = frappe.get_all(
		"Nurse Interventions",
		filters=[_dt_between("date", from_date, to_date)],
		fields=["status"],
	)
	nurse_done = sum(1 for r in nurse_rows if r.status == "Completed")
	nurse_pending = sum(1 for r in nurse_rows if r.status != "Completed")

	visit_total = frappe.db.count("Patient Visit", filters=[_dt_between("creation", from_date, to_date)])

	consult_filters = [_dt_between("consultation_datetime", from_date, to_date)]
	if doctor:
		consult_filters.append(["doctor", "=", doctor])
	seen_count = len(
		set(frappe.get_all("Doctor Consultation", filters=consult_filters, pluck="patient_consultation"))
	)

	if doctor:
		# Scope the denominator to that doctor's own assigned visits, so the
		# percentage reads as "how much of MY list have I seen" rather than
		# being diluted by the whole hospital's visit count.
		visit_total = frappe.db.count(
			"Patient Visit",
			filters=[_dt_between("creation", from_date, to_date), ["doctor_name", "=", doctor]],
		)

	seen_pct = round((seen_count / visit_total) * 100) if visit_total else 0

	referral_filters = [_dt_between("consultation_datetime", from_date, to_date), ["referred_to", "is", "set"]]
	if doctor:
		referral_filters.append(["doctor", "=", doctor])
	referral_count = frappe.db.count("Doctor Consultation", filters=referral_filters)

	return {
		"nurse_done": nurse_done,
		"nurse_pending": nurse_pending,
		"seen_count": seen_count,
		"seen_total": visit_total,
		"seen_pct": seen_pct,
		"referral_count": referral_count,
	}


def _doctor_table(from_date, to_date):
	visits = frappe.get_all(
		"Patient Visit",
		filters=[_dt_between("creation", from_date, to_date), ["doctor_name", "is", "set"]],
		fields=["doctor_name"],
	)
	visit_counts = {}
	for v in visits:
		visit_counts[v.doctor_name] = visit_counts.get(v.doctor_name, 0) + 1

	consults = frappe.get_all(
		"Doctor Consultation",
		filters=[_dt_between("consultation_datetime", from_date, to_date)],
		fields=["doctor", "patient_consultation"],
	)
	seen_by_doctor = {}
	for c in consults:
		seen_by_doctor.setdefault(c.doctor, set()).add(c.patient_consultation)

	doctors = sorted(set(visit_counts) | set(seen_by_doctor))
	rows = []
	for doc in doctors:
		visits_n = visit_counts.get(doc, 0)
		seen_n = len(seen_by_doctor.get(doc, set()))
		pct = round((seen_n / visits_n) * 100) if visits_n else 0
		rows.append({"doctor": doc, "visits": visits_n, "seen": seen_n, "pct": pct})
	rows.sort(key=lambda r: r["visits"], reverse=True)
	return rows


def _admission_discharge(from_date, to_date):
	discharged_filters = [
		["admission_status", "=", "Discharged"],
		_dt_between("discharge_date", from_date, to_date),
	]
	discharged_visits = frappe.get_all("Patient Visit", filters=discharged_filters, pluck="name")

	summary_done = set()
	if discharged_visits:
		summary_done = set(
			frappe.get_all(
				"Discharge Summary", filters={"patient_visit": ["in", discharged_visits]}, pluck="patient_visit"
			)
		)
	pending = [v for v in discharged_visits if v not in summary_done]

	mlc_count = frappe.db.count(
		"Patient Visit",
		filters=[_dt_between("creation", from_date, to_date), ["is_mlc_case", "=", 1]],
	)

	return {
		"discharged_count": len(discharged_visits),
		"discharge_summary_pending": len(pending),
		# "no linked Discharge Summary" isn't a stored field anywhere, so it
		# can't be expressed as a plain List View filter - hand the frontend
		# the exact visit names instead, for a `name in [...]` drill-down.
		"discharge_summary_pending_visits": pending[:200],
		"mlc_count": mlc_count,
	}


def _billing(from_date, to_date, category):
	base_filters = [_dt_between("sale_datetime", from_date, to_date), ["docstatus", "=", 1]]
	if category:
		base_filters.append(["billing_category", "=", category])

	bills = frappe.get_all(
		"Billing",
		filters=base_filters,
		fields=["amount_collected", "payment_mode", "billing_category", "adjustment_type", "charity_amount"],
	)

	total_collected = sum(flt(b.amount_collected) for b in bills)
	# Always show every real Payment Mode option, even at 0, so the card row
	# doesn't silently shrink to whichever modes happened to get used in this
	# date range - "Unspecified" is the one exception, added only when a bill
	# actually needed it, since it isn't a real selectable mode.
	by_mode = {mode: 0 for mode in _payment_modes()}
	for b in bills:
		# A bill with nothing actually collected (fully settled against an
		# advance, or not yet paid) has no real payment mode to attribute -
		# skip it rather than dumping it into a misleading "Unspecified"
		# bucket, since it never collected money through any channel.
		if flt(b.amount_collected) == 0:
			continue
		mode = b.payment_mode or "Unspecified"
		by_mode[mode] = by_mode.get(mode, 0) + flt(b.amount_collected)

	general_bills = [b for b in bills if b.billing_category == "General" and flt(b.charity_amount) > 0]
	staff_bills = [
		b for b in bills if b.billing_category in SUBSIDY_STAFF_CATEGORIES and flt(b.charity_amount) > 0
	]
	tds_bills = [b for b in bills if b.adjustment_type == "Increase" and flt(b.charity_amount) > 0]

	advance_rows = frappe.get_all(
		"Patient Advance", filters=[_dt_between("received_on", from_date, to_date)], fields=["amount"]
	)

	return {
		"total_collected": total_collected,
		"collected_by_mode": by_mode,
		"advance_collected_amount": sum(flt(a.amount) for a in advance_rows),
		"advance_collected_count": len(advance_rows),
		"subsidy_general_amount": sum(flt(b.charity_amount) for b in general_bills),
		"subsidy_general_count": len(general_bills),
		"subsidy_staff_amount": sum(flt(b.charity_amount) for b in staff_bills),
		"subsidy_staff_count": len(staff_bills),
		"tds_amount": sum(flt(b.charity_amount) for b in tds_bills),
		"tds_count": len(tds_bills),
	}


def _patient_mix(from_date, to_date):
	visits = frappe.get_all(
		"Patient Visit",
		filters=[_dt_between("creation", from_date, to_date)],
		fields=["billing_category"],
	)
	# Same rule as the payment-mode cards: every real Category Price
	# Adjustment category always shows, even at 0, so the row count doesn't
	# shrink to whatever happened to have a visit this range - "Unspecified"
	# (no billing_category set at all) is the one exception, shown only when
	# a visit actually needed it, since it isn't a real selectable category.
	counts = {c: 0 for c in frappe.get_all("Category Price Adjustment", pluck="name")}
	for v in visits:
		key = v.billing_category or "Unspecified"
		counts[key] = counts.get(key, 0) + 1
	total = len(visits)
	rows = [
		{"category": k, "count": v, "pct": round((v / total) * 100) if total else 0}
		for k, v in counts.items()
	]
	rows.sort(key=lambda r: r["count"], reverse=True)
	return rows


# ---------------------------------------------------------------------------
# Stock & Pharmacy tab
# ---------------------------------------------------------------------------

PENDING_PO_STATUSES = ["Pending Approval", "Approved", "Sent to Dealer", "Partially Received"]


@frappe.whitelist()
def get_warehouses():
	frappe.has_permission("Warehouse", "read", throw=True)
	return frappe.get_all("Warehouse", filters={"is_active": 1}, pluck="name", order_by="name")


def _expiry_rows(warehouse=None, item_type=None):
	# Reuses the Outlet-wise Expiry Report's own query rather than
	# re-deriving "current qty + days to expiry per batch" a second way -
	# same latest-ledger-row-per-batch technique, same Expired/Expiring
	# Soon/Safe thresholds, so this tab never disagrees with that report.
	from metta.stock.page.outletwise_expiry_report.outletwise_expiry_report import get_data as get_expiry_data

	return get_expiry_data(warehouse=warehouse or None, item_type=item_type or None)


def _stock_value(warehouse=None):
	# Values ALL on-hand stock (batch-tracked or not) at each item/warehouse's
	# latest moving-average rate - the expiry report's rows only cover
	# batch-tracked items, which would silently under-count plain
	# consumables that never got a batch/expiry at all.
	conditions = ""
	values = {}
	if warehouse:
		conditions = "AND sb.warehouse = %(warehouse)s"
		values["warehouse"] = warehouse

	rows = frappe.db.sql(
		f"""
		SELECT sb.item, sb.warehouse, sb.actual_qty, latest.valuation_rate
		FROM `tabStock Balance` sb
		LEFT JOIN (
			SELECT sle.item, sle.warehouse, sle.valuation_rate,
				ROW_NUMBER() OVER (
					PARTITION BY sle.item, sle.warehouse
					ORDER BY sle.posting_datetime DESC, sle.creation DESC
				) AS rn
			FROM `tabStock Ledger Entry` sle
		) latest ON latest.item = sb.item AND latest.warehouse = sb.warehouse AND latest.rn = 1
		WHERE sb.actual_qty > 0 {conditions}
		""",
		values,
		as_dict=True,
	)

	# Show every real Warehouse record, even at 0 - same "always show the
	# real options" rule as payment modes and billing categories, so this
	# breakdown doesn't shrink to whichever warehouses happened to have
	# valued stock on hand.
	all_warehouses = frappe.get_all("Warehouse", pluck="name") if not warehouse else [warehouse]
	by_location = {w: 0.0 for w in all_warehouses}
	total = 0.0
	for r in rows:
		value = flt(r.actual_qty) * flt(r.valuation_rate)
		total += value
		by_location[r.warehouse] = by_location.get(r.warehouse, 0) + value

	breakdown = [
		{
			"category": k,
			"value": v,
			"pct": round((v / total) * 100) if total else 0,
			"warehouses": [k],
		}
		for k, v in by_location.items()
	]
	breakdown.sort(key=lambda r: r["value"], reverse=True)
	return total, breakdown


def _low_stock_count(warehouse=None):
	reorder_rows = frappe.get_all("Item Reorder Level", fields=["parent as item", "warehouse", "reorder_level"])
	reorder_map = {}
	for r in reorder_rows:
		reorder_map[(r.item, r.warehouse)] = flt(r.reorder_level)

	balance_filters = {"actual_qty": [">", 0]}
	if warehouse:
		balance_filters["warehouse"] = warehouse
	balances = frappe.get_all("Stock Balance", filters=balance_filters, fields=["item", "warehouse", "actual_qty"])

	# Stock Balance is autonamed "{item}-{warehouse}" - build that same name
	# for each qualifying row so the frontend can drill down with a plain
	# `name in [...]` filter instead of trying to re-express a two-field
	# item+warehouse-vs-reorder-level comparison as a URL filter.
	names = []
	for b in balances:
		level = reorder_map.get((b.item, b.warehouse))
		if level and flt(b.actual_qty) <= level:
			names.append(f"{b.item}-{b.warehouse}")
	return names


def _procurement(from_date, to_date):
	pending_po = frappe.db.count("Purchase Order", filters={"status": ["in", PENDING_PO_STATUSES]})

	today = getdate(nowdate())
	overdue_po = frappe.db.count(
		"Purchase Order",
		filters=[["expected_delivery", "<", str(today)], ["status", "in", PENDING_PO_STATUSES]],
	)

	unpaid_bills = frappe.get_all(
		"Purchase Bill",
		filters={"payment_status": ["!=", "Paid"], "docstatus": 1},
		fields=["balance_due", "due_date"],
	)
	pending_payment_amount = sum(flt(b.balance_due) for b in unpaid_bills)
	overdue_bills = [b for b in unpaid_bills if b.due_date and getdate(b.due_date) < today]
	overdue_payment_amount = sum(flt(b.balance_due) for b in overdue_bills)

	return {
		"pending_po_count": pending_po,
		"overdue_po_count": overdue_po,
		"pending_payment_amount": pending_payment_amount,
		"pending_payment_count": len(unpaid_bills),
		"overdue_payment_amount": overdue_payment_amount,
		"overdue_payment_count": len(overdue_bills),
	}


def _consumption(from_date, to_date, warehouse):
	filters = [_dt_between("issue_date_time", from_date, to_date), ["docstatus", "=", 1]]
	if warehouse:
		filters.append(["warehouse", "=", warehouse])
	issues = frappe.get_all("Material Issue", filters=filters, fields=["name", "warehouse"])

	total_qty = 0
	by_location = {}
	if issues:
		wh_by_issue = {i.name: i.warehouse for i in issues}
		wh_types = {w.name: w.warehouse_type for w in frappe.get_all("Warehouse", fields=["name", "warehouse_type"])}
		items = frappe.get_all(
			"Material Issue Item", filters={"parent": ["in", [i.name for i in issues]]}, fields=["parent", "qty"]
		)
		for it in items:
			total_qty += flt(it.qty)
			wtype = wh_types.get(wh_by_issue.get(it.parent)) or "Unspecified"
			by_location[wtype] = by_location.get(wtype, 0) + flt(it.qty)

	return {
		"issues_count": len(issues),
		"issues_qty": total_qty,
		"issues_by_location": by_location,
	}


def _top_suppliers(from_date, to_date):
	bills = frappe.get_all(
		"Purchase Bill",
		filters=[_dt_between("creation", from_date, to_date), ["docstatus", "=", 1]],
		fields=["supplier", "total_amount", "balance_due", "due_date"],
	)
	today = getdate(nowdate())
	by_supplier = {}
	for b in bills:
		row = by_supplier.setdefault(b.supplier, {"supplier": b.supplier, "orders": 0, "spend": 0.0, "due": 0.0, "overdue": False})
		row["orders"] += 1
		row["spend"] += flt(b.total_amount)
		row["due"] += flt(b.balance_due)
		if flt(b.balance_due) > 0 and b.due_date and getdate(b.due_date) < today:
			row["overdue"] = True

	rows = []
	for row in by_supplier.values():
		if row["overdue"]:
			status = "Overdue"
		elif row["due"] > 0:
			status = "Partially Paid"
		else:
			status = "Paid"
		rows.append({"supplier": row["supplier"], "orders": row["orders"], "spend": row["spend"], "status": status})
	rows.sort(key=lambda r: r["spend"], reverse=True)
	return rows[:8]


@frappe.whitelist()
def get_stock_data(from_date=None, to_date=None, warehouse=None, category=None):
	frappe.has_permission("Stock Balance", "read", throw=True)
	from_date, to_date = _resolve_range(from_date, to_date)

	expiry_rows = _expiry_rows(warehouse=warehouse, item_type=category)
	near_expiry = [r for r in expiry_rows if r["status"] == "Expiring Soon"]
	expired = [r for r in expiry_rows if r["status"] == "Expired"]

	total_stock_value, stock_by_location = _stock_value(warehouse)
	low_stock_names = _low_stock_count(warehouse)

	data = {
		"range": {"from_date": str(from_date), "to_date": str(to_date)},
		"low_stock_count": len(low_stock_names),
		"low_stock_names": low_stock_names[:200],
		"near_expiry_count": len(near_expiry),
		"near_expiry_value": sum(flt(r["closing_value"]) for r in near_expiry),
		"expired_count": len(expired),
		"expired_value": sum(flt(r["closing_value"]) for r in expired),
		"total_stock_value": total_stock_value,
		"stock_by_location": stock_by_location,
	}
	data.update(_procurement(from_date, to_date))
	data.update(_consumption(from_date, to_date, warehouse))
	data["top_suppliers"] = _top_suppliers(from_date, to_date)
	return data
