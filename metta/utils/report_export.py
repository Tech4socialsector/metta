import base64
import io
import json
import re

import cairosvg
import xlsxwriter

import frappe
from frappe.utils import escape_html
from frappe.utils.pdf import get_pdf

HOSPITAL_NAME = "LANDOUR COMMUNITY HOSPITAL"
HOSPITAL_ADDRESS = ["MUSSOORIE - 248179", "DEHRADUN, UTTARAKHAND"]

HEADER_COLOR = "#1b4f8c"


def _logo_png(width):
	# Rasterized once per width and cached - cairosvg re-parsing the same SVG
	# on every export would be wasted work since the logo never changes.
	cache_key = f"metta_logo_png_{width}"
	png = frappe.cache.get_value(cache_key)
	if png:
		return png

	logo_path = frappe.get_app_path("metta", "public", "images", "lch.svg")
	png = cairosvg.svg2png(url=logo_path, output_width=width)
	frappe.cache.set_value(cache_key, png, expires_in_sec=3600)
	return png


def _logo_data_uri(width):
	return "data:image/png;base64," + base64.b64encode(_logo_png(width)).decode()


def _parse_json_arg(value):
	return json.loads(value) if isinstance(value, str) else value


def _safe_filename(filename):
	filename = re.sub(r"[^A-Za-z0-9 _-]", "", filename or "report").strip() or "report"
	return filename.replace(" ", "_")


def _cell_text(value):
	return "" if value in (None, "") else str(value)


@frappe.whitelist()
def export_excel(title, columns, rows, filename=None, subtitle=None):
	columns = _parse_json_arg(columns)
	rows = _parse_json_arg(rows)

	frappe.response["filename"] = f"{_safe_filename(filename or title)}.xlsx"
	frappe.response["filecontent"] = build_xlsx(title, columns, rows, subtitle)
	frappe.response["type"] = "download"


PDF_PAGE_SIZES = {"A4", "Letter", "Legal"}
PDF_ORIENTATIONS = {"Landscape", "Portrait"}


@frappe.whitelist()
def export_pdf(title, columns, rows, filename=None, subtitle=None, page_size="A4", orientation="Portrait"):
	columns = _parse_json_arg(columns)
	rows = _parse_json_arg(rows)

	if page_size not in PDF_PAGE_SIZES:
		page_size = "A4"
	if orientation not in PDF_ORIENTATIONS:
		orientation = "Portrait"

	frappe.response["filename"] = f"{_safe_filename(filename or title)}.pdf"
	frappe.response["filecontent"] = build_pdf(title, columns, rows, subtitle, page_size, orientation)
	frappe.response["type"] = "pdf"


def build_xlsx(title, columns, rows, subtitle=None):
	output = io.BytesIO()
	workbook = xlsxwriter.Workbook(output, {"in_memory": True})
	sheet = workbook.add_worksheet((title or "Report")[:31])

	name_fmt = workbook.add_format({"bold": True, "font_size": 14, "font_color": "#0b4a86"})
	address_fmt = workbook.add_format({"font_size": 9, "font_color": "#444444"})
	title_fmt = workbook.add_format({"bold": True, "font_size": 12, "align": "center", "valign": "vcenter"})
	subtitle_fmt = workbook.add_format({"font_size": 9, "italic": True, "align": "center", "font_color": "#555555"})
	header_fmt = workbook.add_format(
		{"bold": True, "bg_color": HEADER_COLOR, "font_color": "#ffffff", "border": 1}
	)
	cell_fmt = workbook.add_format({"border": 1})

	last_col = max(len(columns) - 1, 2)

	row = 0
	sheet.merge_range(row, 0, row, last_col, HOSPITAL_NAME, name_fmt)
	row += 1
	for line in HOSPITAL_ADDRESS:
		sheet.merge_range(row, 0, row, last_col, line, address_fmt)
		row += 1

	# Logo sits to the right of the hospital name/address block, top-right of
	# the whole sheet - anchored on the same first row the hospital name is on.
	sheet.insert_image(0, last_col + 1, "logo.png", {"image_data": io.BytesIO(_logo_png(90))})

	row += 1
	sheet.merge_range(row, 0, row, last_col, title, title_fmt)
	row += 1
	if subtitle:
		sheet.merge_range(row, 0, row, last_col, subtitle, subtitle_fmt)
		row += 1
	row += 1

	header_row = row
	for c, col in enumerate(columns):
		sheet.write(header_row, c, col, header_fmt)

	for r, data_row in enumerate(rows):
		for c, value in enumerate(data_row):
			sheet.write(header_row + 1 + r, c, _cell_text(value), cell_fmt)

	for c, col in enumerate(columns):
		sheet.set_column(c, c, max(12, min(40, len(str(col)) + 4)))

	sheet.freeze_panes(header_row + 1, 0)
	workbook.close()
	return output.getvalue()


def build_pdf(title, columns, rows, subtitle=None, page_size="A4", orientation="Portrait"):
	header_html = "".join(f"<th>{escape_html(str(c))}</th>" for c in columns)
	body_html = "".join(
		"<tr>" + "".join(f"<td>{escape_html(_cell_text(v))}</td>" for v in data_row) + "</tr>" for data_row in rows
	)
	address_html = "".join(f"<div>{escape_html(line)}</div>" for line in HOSPITAL_ADDRESS)
	subtitle_html = f'<div class="report-subtitle">{escape_html(subtitle)}</div>' if subtitle else ""

	# Portrait has roughly two-thirds the usable width of Landscape, so the
	# same column count needs a smaller font there to stay legible once
	# table-layout: fixed starts splitting that width between more columns.
	column_count = len(columns)
	if orientation == "Landscape":
		table_font_size = 9 if column_count <= 10 else 8
	else:
		table_font_size = 9 if column_count <= 6 else 8 if column_count <= 9 else 7

	html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
	body {{ font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; }}
	/* wkhtmltopdf's bundled QtWebKit doesn't support flexbox, so the
	   letterhead layout has to fall back to an old-school table. */
	.header {{
		width: 100%;
		border-collapse: collapse;
		border-bottom: 2px solid {HEADER_COLOR};
		padding-bottom: 8px;
		margin-bottom: 10px;
	}}
	.header td {{ padding: 0; vertical-align: top; border: none; }}
	.hospital-name {{ font-size: 16px; font-weight: 700; color: #0b4a86; }}
	.hospital-address {{ font-size: 10px; color: #444444; margin-top: 2px; }}
	.logo-cell {{ text-align: right; }}
	.logo {{ height: 60px; }}
	.report-title {{
		text-align: center;
		font-size: 14px;
		font-weight: 700;
		margin: 4px 0 4px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}}
	.report-subtitle {{ text-align: center; font-size: 10px; color: #555555; margin-bottom: 10px; }}
	/* table-layout: fixed caps the table at the page's printable width no
	   matter how much text is in a cell - without it, a header like
	   "Voucher Type" refusing to wrap pushes the table wider than the page,
	   and wkhtmltopdf (unlike a browser) has no scrollbar to fall back on:
	   it just silently clips whatever falls past the right margin. */
	table.data {{ width: 100%; table-layout: fixed; border-collapse: collapse; font-size: {table_font_size}px; }}
	table.data th, table.data td {{
		border: 1px solid #999999;
		word-wrap: break-word;
		overflow-wrap: break-word;
	}}
	table.data th {{
		background: #f0f0f0;
		color: #000000;
		font-weight: 700;
		padding: 4px 5px;
		text-align: left;
		text-transform: uppercase;
	}}
	table.data td {{ padding: 3px 5px; }}
	table.data tbody tr:nth-child(even) td {{ background: #f9f9f9; }}
</style>
</head>
<body>
	<table class="header">
		<tr>
			<td>
				<div class="hospital-name">{escape_html(HOSPITAL_NAME)}</div>
				<div class="hospital-address">{address_html}</div>
			</td>
			<td class="logo-cell"><img class="logo" src="{_logo_data_uri(240)}"></td>
		</tr>
	</table>
	<div class="report-title">{escape_html(str(title))}</div>
	{subtitle_html}
	<table class="data">
		<thead><tr>{header_html}</tr></thead>
		<tbody>{body_html}</tbody>
	</table>
</body>
</html>"""

	return get_pdf(html, {"orientation": orientation, "page-size": page_size, "margin-top": "10mm"})
