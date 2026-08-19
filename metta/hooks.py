app_name = "metta"
app_title = "metta"
app_publisher = "tfss"
app_description = "hospital management information system"
app_email = "tech4socialsector@azimpremjifoundation.org"
app_license = "mit"

# Fixtures
# --------

fixtures = [
	{"doctype": "Print Format", "filters": [["name", "=", "Patient Registration Receipt"]]},
	{
		"doctype": "Number Card",
		"filters": [
			[
				"name",
				"in",
				[
					"Nurse Interventions",
					"Patient Visit",
					"Patient Registration-1",
					"Doctor Consultation",
				],
			]
		],
	},
	{
		"doctype": "Workspace Sidebar",
		"filters": [
			[
				"name",
				"in",
				[
					"HMIS",
					"Master Form",
					"Stock and Pharmacy",
					"Front Desk",
					"Nurse",
					"Doctor",
					"Billing Desk",
					"Lab",
					"Account Desk",
					"Store Desk",
					"Warehouse Desk",
					"Purchase Desk",
					"Pharmacy Desk",
				],
			]
		],
	},
	{
		"doctype": "Desktop Icon",
		"filters": [
			[
				"name",
				"in",
				[
					"HMIS",
					"Master Form",
					"Stock and Pharmacy",
					"Front Desk",
					"Nurse",
					"Doctor",
					"Billing Desk",
					"Lab",
					"Account Desk",
					"Framework",
					"Store Desk",
					"Warehouse Desk",
					"Purchase Desk",
					"Pharmacy Desk",
				],
			]
		],
	},
	{
		"doctype": "Role",
		"filters": [
			[
				"name",
				"in",
				[
					"Front Desk",
					"Nurse",
																																																																																							"Pharmacy Staff",
					"Billing Staff",
					"Store Staff",
					"Warehouse Staffs",
					"Purchase Approver",
					"Account Staff",
					"Doctor",
					"Lab Staff",
				],
			]
		],
	},
	{
		"doctype": "Notification",
		"filters": [
			[
				"name",
				"in",
				[
					"Stock Indent Submitted",
					"Purchase Order Pending Approval",
					"Purchase Order Sent to Dealer",
					"Purchase Return Submitted",
				],
			]
		],
	},
]
# Workspace is exported as a module file (metta/workspace/hmis/hmis.json), not a
# fixture - migrate's orphan-cleanup deletes public+module+app workspaces that
# aren't backed by a file, so fixture-only export isn't safe for this doctype.
# Workspace Sidebar and Desktop Icon are *separate* doctypes only created when a
# workspace is built via the Desk UI directly - migrate never generates them, so
# they have to be shared explicitly. Their own orphan-cleanup only targets
# standard=1 records, and ours are standard=0, so fixture export is safe here.
 
# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
add_to_apps_screen = [
	{
		"name": "metta",
		"title": "metta",
		"route": "/app/stock-and-pharmacy",
	}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/metta/css/metta.css"
app_include_js = "/assets/metta/js/report_export.js"

# include js, css files in header of web template
# web_include_css = "/assets/metta/css/metta.css"
# web_include_js = "/assets/metta/js/metta.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "metta/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "metta/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
role_home_page = {
	"Front Desk": "front-desk-dashboard",
	"Doctor": "doctor-dashboard",
}

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "metta.utils.jinja_methods",
# 	"filters": "metta.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "metta.install.before_install"
# after_install = "metta.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "metta.uninstall.before_uninstall"
# after_uninstall = "metta.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "metta.utils.before_app_install"
# after_app_install = "metta.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "metta.utils.before_app_uninstall"
# after_app_uninstall = "metta.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "metta.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "metta.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

permission_query_conditions = {
	"Patient Visit": "metta.metta.doctype.patient_visit.patient_visit.get_permission_query_conditions",
	"Nurse Interventions": "metta.metta.doctype.nurse_interventions.nurse_interventions.get_permission_query_conditions",
	"Doctor Consultation": "metta.metta.doctype.doctor_consultation.doctor_consultation.get_permission_query_conditions",
	"Appointment": "metta.metta.doctype.appointment.appointment.get_permission_query_conditions",
	"Diagnostic Test": "metta.metta.doctype.diagnostic_test.diagnostic_test.get_permission_query_conditions",
	"Discharge Summary": "metta.metta.doctype.discharge_summary.discharge_summary.get_permission_query_conditions",
	"Doctor Leave": "metta.metta.doctype.doctor_leave.doctor_leave.get_permission_query_conditions",
}

has_permission = {
	"Patient Visit": "metta.metta.doctype.patient_visit.patient_visit.has_permission",
	"Nurse Interventions": "metta.metta.doctype.nurse_interventions.nurse_interventions.has_permission",
	"Doctor Consultation": "metta.metta.doctype.doctor_consultation.doctor_consultation.has_permission",
	"Appointment": "metta.metta.doctype.appointment.appointment.has_permission",
	"Diagnostic Test": "metta.metta.doctype.diagnostic_test.diagnostic_test.has_permission",
	"Discharge Summary": "metta.metta.doctype.discharge_summary.discharge_summary.has_permission",
	"Doctor Leave": "metta.metta.doctype.doctor_leave.doctor_leave.has_permission",
}

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": [
		"metta.stock.tasks.send_expiry_alerts",
	],
}

# Testing
# -------

# before_tests = "metta.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "metta.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "metta.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "metta.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["metta.utils.before_request"]
# after_request = ["metta.utils.after_request"]

# Job Events
# ----------
# before_job = ["metta.utils.before_job"]
# after_job = ["metta.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"metta.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

