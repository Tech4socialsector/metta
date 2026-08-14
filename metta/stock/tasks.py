# Copyright (c) 2026, tfss and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import escape_html, flt

from metta.stock.page.outletwise_expiry_report.outletwise_expiry_report import get_data

# Alerts fire for anything expiring within this many days - deliberately the
# same window as a batch being "Expiring Soon" would need tightening for,
# but kept as its own constant since the alert's urgency window and the
# report's display threshold are two different decisions that happen to
# start at the same number today.
ALERT_WINDOW_DAYS = 15

# TEMPORARY - swap this for the organization's real distribution list (or a
# Role-based lookup) once this has been verified to actually work. Left as a
# single, obvious place to change rather than buried in the logic below.
EXPIRY_ALERT_RECIPIENTS = ["antonyad0431@gmail.com"]


def send_expiry_alerts():
	# Reuses the Outlet-wise Expiry Report's own query rather than
	# duplicating it - "still has stock on hand" and "expiry-dated batch"
	# are exactly what that report already computes.
	rows = [r for r in get_data() if r["days_to_expiry"] is not None and r["days_to_expiry"] <= ALERT_WINDOW_DAYS]
	if not rows:
		return

	rows.sort(key=lambda r: r["days_to_expiry"])
	frappe.sendmail(
		recipients=EXPIRY_ALERT_RECIPIENTS,
		subject=f"Stock Expiry Alert - {len(rows)} batch(es) need attention",
		message=_build_email_html(rows),
	)


def _build_email_html(rows):
	body_rows = "".join(
		f"""
		<tr>
			<td>{escape_html(row["item"] or "")}</td>
			<td>{escape_html(row["item_name"] or "")}</td>
			<td>{escape_html(row["warehouse"] or "")}</td>
			<td>{escape_html(row["batch_no"] or "")}</td>
			<td>{escape_html(row["rack_location"] or "")}</td>
			<td style="text-align: center;">{flt(row["qty_after_transaction"])}</td>
			<td style="text-align: center;">{row["expiry_date"]}</td>
			<td style="text-align: center; color: {"#a3341f" if row["days_to_expiry"] < 0 else "#a3701f"};">
				{row["days_to_expiry"]}
			</td>
		</tr>"""
		for row in rows
	)

	return f"""
	<p>The following batches are expired or expiring within {ALERT_WINDOW_DAYS} days and still have stock on hand.
	Please prioritize using, transferring, or returning them.</p>
	<table style="border-collapse: collapse; width: 100%; font-size: 13px;">
		<thead>
			<tr style="background: #1b4f8c; color: #fff;">
				<th style="padding: 6px 10px; text-align: left;">Item</th>
				<th style="padding: 6px 10px; text-align: left;">Item Name</th>
				<th style="padding: 6px 10px; text-align: left;">Warehouse</th>
				<th style="padding: 6px 10px; text-align: left;">Batch No</th>
				<th style="padding: 6px 10px; text-align: left;">Shelf</th>
				<th style="padding: 6px 10px;">Qty</th>
				<th style="padding: 6px 10px;">Expiry Date</th>
				<th style="padding: 6px 10px;">Days to Expiry</th>
			</tr>
		</thead>
		<tbody>{body_rows}</tbody>
	</table>
	"""
