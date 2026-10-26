# Desk ↔ Vue parity checklist

Desk keeps working unchanged. Every Vue screen must carry every field and
every rule of the Desk form(s) it covers. Server validations (`validate()`,
`after_insert`) always run, because the Vue screens save through the same
doctypes. This list tracks the browser-side rules that had to be ported.

Legend: ✅ ported · ➖ not shown in Desk either (hidden / set by the system) · ⏳ later screen

## New registration (`/hmis/register`) = Patient Registration + OP Patient Visit

Saved by `metta.api.register_patient`: both records are inserted in one
transaction, so a failure in either one leaves no half-registered patient.

### Patient Registration fields
| Field | Status | Notes |
|---|---|---|
| first_name (reqd) | ✅ | |
| last_name | ✅ | |
| patient_name | ✅ | read-only, first + last |
| blood_group | ✅ | |
| dob | ✅ | |
| age | ✅ | computed from DOB; typed by hand when there's no DOB |
| sex (reqd) | ✅ | |
| marital_status | ✅ | |
| phone | ✅ | |
| uid | ➖ | hidden in Desk, never set |
| emergency_contact_name | ✅ | |
| emergency_phone_number | ✅ | |
| relationship_to_the_patient | ✅ | |
| relationship_other | ✅ | shown and required only for "Other" |
| email | ✅ | |
| pin_code | ✅ | |
| state | ✅ | |
| district | ✅ | |
| address (Village) | ✅ | free text plus pincode suggestions |
| billing_category | ✅ | |
| corporate_customer (Company Name) | ✅ | shown for non-fixed categories |
| staff_id | ✅ | shown when a company is set |
| dependent_relationship | ✅ | shown for Staff Dependent |
| gst_number | ✅ | read-only, from the company |
| charity_percent | ✅ | read-only; label switches to TDS Percent |
| default_currency | ✅ | default INR |

### Patient Registration rules (`patient_registration.js`)
| Rule | Status |
|---|---|
| Full name preview | ✅ |
| Age from DOB (kept when there's no DOB) | ✅ |
| Phone / emergency phone → digits only, max 10 | ✅ |
| Duplicate phone warning (non-blocking) | ✅ shown as a card instead of a popup |
| CHW field-record match dialog → fill-if-empty → link on save | ✅ the link happens in the same save |
| Pincode → State, District, Village list (1 village → auto-fill, many → blank) | ✅ |
| Village accepts free text (ignore_validation) | ✅ |
| Relationship ≠ Other clears "Specify Relationship" | ✅ |
| Company picked → Billing Category + GSTIN (fetch_from) | ✅ |
| Company cleared → clears Staff Code and company-driven category | ✅ |
| Fixed category picked → clears Company | ✅ |
| Category ≠ Staff Dependent → clears Relationship to Staff | ✅ |
| Charity Percent label → TDS Percent for an active Increase category | ✅ |
| Staff Dependent son/daughter aged 21+ → General | ✅ |

### Patient Visit (OP) fields
| Field | Status | Notes |
|---|---|---|
| uhin_id | ✅ | set by the server from the new registration |
| registration_category | ✅ | always OP for a new walk-in (Desk forces this too) |
| converted_from_registration | ➖ | IP only |
| registration_type | ✅ | |
| appointment | ➖ | set only by Appointment "Check In" |
| first_name … address (demographics) | ✅ | copied from the registration (Desk: fetch_from uhin_id) |
| date / time | ✅ | IST 12-hour time |
| department_name | ✅ | |
| doctor_name | ✅ | filtered by department |
| fee_amount | ✅ | read-only, from the registration type |
| default_currency | ✅ | |
| billing_category | ✅ | same as the registration's (Desk: fetch_from) |
| company_name | ✅ | same as the registration's company |
| charity_percent | ✅ | editable for General only |
| adjustment_type | ✅ | read-only (the server resets it from the category on every save) |
| charity_amount | ✅ | General only |
| discount_amount / net_amount | ✅ | read-only, calculated |
| payment_mode | ✅ | shown while net > 0 |
| corporate_customer | ✅ | shown and required for Credit - Corporate |
| collected_by | ➖ | set by the server |
| IP Details / MLC / Advance Tracking sections | ⏳ | IP admission screen |
| Medical History tab | ➖ | hidden in Desk |

### Patient Visit rules (`patient_visit.js`)
| Rule | Status |
|---|---|
| Time defaults to IST now | ✅ |
| Registration type suggestion: General/Emergency × New Reg (after-hours cutoffs, Emergency department, keep Emergency once set) | ✅ always "New Reg" for a brand-new patient |
| Department → clear doctor, auto-pick a lone doctor | ✅ |
| Doctor list filtered by department | ✅ |
| Registration type → fee (fetch_from) | ✅ |
| Category → charity % + adjustment type; non-General clears charity amount | ✅ |
| Company patient → suggest Credit - Corporate | ✅ |
| Credit - Corporate → Corporate Customer = the patient's company (still changeable) | ✅ |
| Increase (TDS) category → the added amount is labelled "TDS Amount", not "Discount Amount" | ✅ Vue only; Desk still says Discount Amount |
| Charity % ↔ amount sync (General) | ✅ |
| Billing totals (Charity / Increase, amount wins over %) | ✅ |
| Charity/TDS labels | ✅ |
| Receipt Preview → Print Receipt | ✅ after saving |

### Deliberate differences (safer than Desk, same saved result)
- When Net Amount drops to 0, Payment Mode is cleared, and leaving Credit - Corporate clears Corporate Customer. Desk keeps those hidden values, which is what caused the "hidden mandatory field" save error.
- Duplicate-phone and CHW messages appear as cards and dialogs on the page instead of Desk popups. The wording is the same.

## New OP visit for a returning patient (`/hmis/visit/new/<UHIN>`) = Patient Visit (OP)

Registration happens once per patient. Every later visit is only a new
Patient Visit against the same UHIN, saved by `metta.api.create_op_visit`.
It's reached from the patient search box, or from the duplicate-phone card
on New registration.

The visit fields and rules are the same code as the first visit
(`src/data/useOpVisit.js` + `src/components/OpVisitFields.vue`), plus:

| Item | Status | Notes |
|---|---|---|
| Patient banner (name, age, gender, UHIN, phone, blood group, category, company, village) | ✅ | Desk shows these as fetched read-only fields |
| Registration type: Revisit vs New Reg via `has_prior_visit_of_type` | ✅ | |
| billing_category | ✅ | starts from the patient's; editable for this visit, as in Desk |
| company_name | ✅ | starts from the patient's company; editable, as in Desk |
| Editing patient details | ✅ | link to the Patient Registration in Desk |
| Past visits (last 5) | ✅ | extra for Front Desk; read-only |

## Admit Patient: OP → IP (`/hmis/visits/<OP>/admit`) = Patient Visit (IP)

Saved by `metta.api.create_ip_admission`. It calls Desk's own
`get_admission_defaults`, so it refuses non-OP visits and visits that were
already admitted, then runs the normal Patient Visit validate.

| Item | Status | Notes |
|---|---|---|
| Admit Patient button: OP only, visit dated today, not yet converted (`get_ip_id_for_op`) | ✅ | on the visit page; shows "Admitted as IP-…" once done |
| Defaults copied: uhin_id, department, doctor, converted_from_registration, billing_category, charity_percent, adjustment_type | ✅ | |
| accommodation_type (Ward / Room); switching clears the other side | ✅ | |
| ward → bed grid (get_ward_bed_summary), bed_no | ✅ | free beds clickable, taken beds blocked |
| room (active only) → room details + bed grid (get_room_details), room_bed_no | ✅ | |
| Bed / room bed occupied check (check_bed_availability / check_room_availability), with Desk's message | ✅ | the server re-checks on save |
| "Beds not listed for this ward/room yet" message | ✅ | |
| admission_status (read-only unless Doctor / System Manager), admission_date, expected_discharge_date, discharge_date (only when Discharged) | ✅ | |
| department_name / doctor_name (filtered; a lone doctor is auto-picked) | ✅ | |
| date / time (IST) | ✅ | |
| MLC: is_mlc_case, mlc_no (required), mlc_type, brought_by, police_station, police_intimation_datetime | ✅ | unticking MLC clears the hidden MLC fields |
| Advance Tracking table | ➖ | builds itself from Patient Advance / Billing |
| Bed transfer logging | ➖ | server-side, on later edits of the IP visit |

## Nursing (`/hmis/nurse`, `/hmis/nurse/<id>`) = Nurse Interventions

The worklist shows **Waiting** (status Pending, oldest first) and **Done today**.
Every Patient Visit creates its Pending record on insert, as in Desk.
Saving uses `frappe.client.save`, so the doctype's own validate() runs.

| Field / rule | Status | Notes |
|---|---|---|
| status (Pending/Completed) | ✅ | shown as a tag; the server sets Completed when vitals are saved |
| patient_registration (Visit), patient_unique_id, patient_name, age, gender | ✅ | banner; read-only, as fetched in Desk |
| date (default Now) | ✅ | |
| temperature, pulse, respiration, saturation, blood_pressure_mmhg, height, weight (reqd) | ✅ | checked before saving |
| bmi + bmi_category (live preview, same thresholds) | ✅ | |
| rbg_level → blood_sugar_status (Low < 70, Normal < 140, High) | ✅ | label shows mg/dL; Desk's "gm/dl" label is a known mislabel (noted in the .py) |
| hemoglobin_level → anemia_status (Male 13, others 12) | ✅ | |
| Status colours (STATUS_COLORS) | ✅ | coloured tags |
| piccle, primary_diagnosis | ✅ | |
| blood_sugar_history (past readings, read-only) | ✅ | last 5, "Show all" for the rest |
| Doctor dashboard alert when completed | ➖ | server side |
| Permissions: Nurse / System Manager edit; Doctor and Front Desk read only; a Doctor sees only their own patients | ✅ | the server's permission hooks apply to the lists too |

## Doctor (`/hmis/doctor`, `/hmis/consultation/<name|new>`)

**Doctor Dashboard** (Desk page `doctor-dashboard`):

| Item | Status | Notes |
|---|---|---|
| Profile line (department, specialization, qualification, Reg. No., mobile) | ✅ | page subtitle |
| Leave banner, Apply Leave dialog (`apply_my_leave`), My Profile | ✅ | My Profile opens the Doctor Master in the generic form |
| Tiles: Assigned Today, Waiting for Vitals, Ready to Consult, Visited Today, Referred to Me, Admitted (IP), with Desk's colours | ✅ | click a tile to list its patients |
| Row actions: Consult, View Vitals, Waiting on nurse, View Consultation, View Visit, assigned status | ✅ | |
| Today's Appointments, Discharge Summary Pending (via `get_discharge_defaults`), Patients Referred to Me + history | ✅ | dialogs |
| Live refresh on `doctor_dashboard_update` | ➖ | re-reads every 30 s instead of listening to the realtime event |

**Doctor Consultation:**

| Field / rule | Status | Notes |
|---|---|---|
| patient_consultation (Visit), patient_name (fetched), doctor (own doctor on a new note, `get_own_doctor`), consultation_datetime (Now) | ✅ | |
| diagnosis, clinical_notes | ✅ | |
| Prescription: in-stock medicine search (`search_pharmacy_items_for_prescription`, Name / Avail. Qty / Warehouse), Dosage, Add | ✅ | Desk's messages |
| Prescription rows: dosage, duration, qty = doses/day × days (read-only), instructions | ✅ | a row needs Dosage and Duration, since the required qty comes from them |
| Suggested tests: search (`search_services_for_consultation`), Type, Add; rows with type and remarks | ✅ | |
| follow_up_date, referred_to | ✅ | the referral itself is server side (`route_referral`) |
| Patient History (collapsible, `get_patient_history`) | ✅ | |
| Vitals popup / "Vitals not recorded yet" alert | ✅ | shown as a card on the page instead of a popup |
| Print Prescription (same print format) | ✅ | |
| Order Diagnostic Tests (`create_diagnostic_tests`), Follow-up Consultation | ✅ | |
| Bill (Billing Staff / System Manager) | ✅ | opens the Vue Billing screen |
| Server checks: own note only, own patient only, row permissions for Doctors | ✅ | server side |

## Every other form: the generic form engine

Each form has a list (`/hmis/app/<Doctype>`) and a form
(`/hmis/app/<Doctype>/<name>` or `/new`). Both are built from the doctype's
own definition, so they follow Desk automatically. There is no "All forms"
menu: each sidebar section links to its forms as it moves out of Desk.

| Desk behaviour | Status |
|---|---|
| Every field, in Desk order: tabs, sections (collapsible too), columns | ✅ |
| Field types: Data, Int, Float, Currency, Percent, Date, Datetime, Time, Select, Link, Dynamic Link, Check, Small Text/Text/Long Text/Text Editor/Code, Password, Attach/Attach Image (upload), Color, Rating, Duration, Read Only | ✅ |
| reqd and mandatory_depends_on (checked before save, like Desk's "Missing Fields") | ✅ |
| depends_on (fields, sections, tabs) | ✅ |
| read_only, read_only_depends_on, set_only_once, allow_on_submit | ✅ |
| Defaults: Today, Now, __user, literal values, Select first option, Check 0 | ✅ |
| fetch_from / fetch_if_empty (picking a Link fills the related fields; clearing it clears them) | ✅ also inside child rows |
| Child tables: grid columns (In List View), row edit dialog with every field, add, delete, reorder | ✅ |
| Save / Submit / Cancel / Delete, following the user's permission on that record | ✅ |
| Submitted documents read-only; cancelled documents locked | ✅ |
| Server validation (validate, before_save, on_submit…) | ✅ runs on every save, as in Desk |
| Unsaved-changes warning, Ctrl+S, "Reload latest" when someone else saved first | ✅ |
| Form-specific Desk client script (`<doctype>.js`) | ⏳ not run by the generic form. Forms with real logic get their own screen (below) |

### Forms with Desk client-script logic (meaningful .js lines)
| Form | Lines | Vue |
|---|---|---|
| Billing | 764 | ✅ own screen (`/hmis/billing`); audited against billing.js/.py - no money differences (server recomputes every amount). Open: change a row's item in place (delete + re-add meanwhile), Batch required before first save for consultation rows (Desk asks on the server save) |
| Patient Visit | 596 | ✅ OP visit, Admit Patient; ⏳ IP edit (bed transfer, discharge) |
| Doctor Consultation | 503 | ⏳ own screen needed |
| Purchase Order | 311 | ✅ own screen (`/hmis/purchase-order`); only the date picker doesn't grey out past dates (still refused on change) |
| Purchase Receipt | 229 | ✅ own screen |
| Patient Registration | 216 | ✅ New registration; ⏳ edit existing patient |
| Purchase Bill | 194 | ✅ own screen; totals match the server to the paisa (site rounding method) |
| Stock Indent | 172 | ⏳ |
| Purchase Return | 168 | ✅ own screen |
| Stock Transfer | 135 | ⏳ |
| Quality Inspection | 118 | ✅ own screen |
| Nurse Interventions | 114 | ✅ Nursing screen |
| Sales Return | 108 | ✅ own screen (`/hmis/sales-return`) |
| Discharge Bill | 101 | ✅ own screen (`/hmis/discharge-bill`) |
| Stock Reconciliation | 54 | ⏳ |
| Appointment | 48 | ✅ own screen (`/hmis/appointments`) |
| Item | 38 | ⏳ |
| Material Issue, Patient Advance, Discharge Summary, Category Price Adjustment, Stock Adjustment | 12–24 | ⏳ small; the generic form covers all their fields meanwhile |

All other forms have no client-script logic, so the generic form matches Desk fully.

## Still to build
- ✅ Patient page, IP visit edit (bed checks, transfer history, admission status, discharge, MLC, advance), Ward bed board (`/hmis/wards`)
- ✅ Reports: 16 reports + Reports home (`/hmis/reports`), figures from Desk's own report code
