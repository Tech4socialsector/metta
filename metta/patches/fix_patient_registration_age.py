import frappe


def execute():
	# Age is now an Int column. Older/cloud sites still hold rows entered
	# back when this was a free-text field, so blank/non-numeric values
	# make the schema ALTER to int(11) NOT NULL DEFAULT 0 fail with a
	# "Data truncated" error, which aborts the whole migrate.
	if not frappe.db.table_exists("Patient Registration"):
		return

	frappe.db.sql(
		"""
		UPDATE `tabPatient Registration`
		SET age = '0'
		WHERE age IS NULL OR TRIM(age) = '' OR age NOT REGEXP '^[0-9]+$'
		"""
	)
