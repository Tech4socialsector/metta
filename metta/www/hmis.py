import frappe
import frappe.sessions

# The CSRF token below is per-session - a cached page would hand the first
# visitor's token to everyone after them.
no_cache = 1


def get_context(context):
	# frappe-ui sends every API call as a POST, which Frappe checks against
	# the session's CSRF token - website pages don't include that token by
	# default (only Desk does), so it's added here, same as the CHW app.
	if context.boot is None:
		context.boot = {}
	context.boot["csrf_token"] = frappe.sessions.get_csrf_token()
	return context
