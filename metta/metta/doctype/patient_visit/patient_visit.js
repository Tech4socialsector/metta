// Copyright (c) 2026, tfss and contributors
// For license information, please see license.txt

frappe.ui.form.on("Patient Visit", {
	onload(frm) {
		// Overrides the field's own "Now" default (see ist_time_now_str()'s
		// own comment for why) - runs once, right when a brand-new entry is
		// first opened, before Front Desk has had any chance to type into it.
		if (frm.is_new()) {
			frm.set_value("time", ist_time_now_str());
		}
	},
	setup(frm) {
		// The server blocks admitting into an inactive room regardless - this
		// just keeps it from being offered as an option in the first place.
		frm.set_query("room", () => ({ filters: { is_active: 1 } }));
		// Doctor Name is always narrowed down to whichever Department is
		// currently picked - with no Department set yet, every doctor is
		// still offered rather than showing an empty list.
		frm.set_query("doctor_name", () =>
			frm.doc.department_name ? { filters: { department: frm.doc.department_name } } : {}
		);
	},
	uhin_id(frm) {
		suggest_registration_type(frm);
	},
	registration_category(frm) {
		// Registration Type / Fee Amount are OP-only - clear immediately so a
		// value auto-suggested before Category was switched to IP doesn't sit
		// there hidden. IP's own admission charge is billed separately.
		if (frm.doc.registration_category === "IP" && frm.doc.registration_type) {
			frm.set_value("registration_type", "");
			frm.set_value("fee_amount", 0);
		}
	},
	time(frm) {
		suggest_registration_type(frm);
	},
	phone(frm) {
		if (!frm.doc.phone) return;
		const digits = frm.doc.phone.replace(/\D/g, "").slice(0, 10);
		if (digits !== frm.doc.phone) frm.set_value("phone", digits);
	},
	department_name(frm) {
		// If Doctor Name was already set to someone outside the newly picked
		// Department, it no longer applies - cleared rather than left
		// silently mismatched with the Department shown right above it.
		if (frm.doc.doctor_name) frm.set_value("doctor_name", "");
		if (!frm.doc.department_name) return;
		frappe.call({
			method: "metta.metta.doctype.patient_visit.patient_visit.get_doctors_by_department",
			args: { department: frm.doc.department_name },
			callback(r) {
				const doctors = r.message || [];
				if (doctors.length === 1) {
					// Only one doctor covers this Department - safe to fill in
					// directly, same as Patient Registration's Pin Code -> Village.
					frm.set_value("doctor_name", doctors[0]);
				}
			},
		});
	},
	refresh(frm) {
		if (frm.is_new()) {
			if (frm.doc.converted_from_registration) {
				// Opened by "Admit Patient" - already correctly set to IP, so
				// there's nothing to restrict, but no reason to allow changing
				// it either.
				frm.set_df_property("registration_category", "read_only", 1);
			} else {
				// A fresh registration normally only starts as OP - IP is
				// usually only reached via "Admit Patient" on an existing OP
				// visit - but IP is still offered here too for a genuine
				// emergency (accident, urgent delivery), gated server-side by
				// the "Emergency Admission" checkbox this reveals.
				frm.set_df_property("registration_category", "options", "\nOP\nIP");
			}
		} else {
			// Once saved, the category is locked for good - changing it after
			// the fact would silently rewrite whichever visit's billing
			// history, exactly what "Admit Patient" exists to avoid.
			frm.set_df_property("registration_category", "read_only", 1);
		}

		// Deciding to discharge a patient is a clinical call - only a Doctor
		// (or an admin correcting a mistake) can actually change this, mirrors
		// the same check enforced server-side in validate().
		const can_change_admission_status =
			frappe.user_roles.includes("Doctor") || frappe.user_roles.includes("System Manager");
		frm.set_df_property("admission_status", "read_only", can_change_admission_status ? 0 : 1);

		// Only meaningful once the registration is saved (frm.doc.name is a
		// real document to render a receipt for).
		if (!frm.is_new()) {
			if (frm.doc.registration_category === "OP") {
				frm.add_custom_button(__("Admit Patient"), () => {
					frappe.call({
						method:
							"metta.metta.doctype.patient_visit.patient_visit.get_admission_defaults",
						args: { op_registration: frm.doc.name },
						callback(r) {
							if (!r.message) return;
							// The OP visit's own record (fee, receipt) is left untouched -
							// this opens a brand-new IP registration instead of converting
							// the current one in place.
							frappe.new_doc("Patient Visit", {
								registration_category: "IP",
								uhin_id: r.message.uhin_id,
								department_name: r.message.department_name,
								doctor_name: r.message.doctor_name,
								converted_from_registration: r.message.converted_from_registration,
								billing_category: r.message.billing_category,
								discount_percent: r.message.discount_percent,
								adjustment_type: r.message.adjustment_type,
							});
						},
					});
				}).addClass("btn-primary");
			}

			frm.add_custom_button(__("Receipt Preview"), () => {
				frappe.call({
					method:
						"metta.metta.doctype.patient_visit.patient_visit.get_receipt_html",
					args: { registration: frm.doc.name },
					callback(r) {
						if (!r.message) {
							return;
						}
						const receipt_html = r.message;
						// A dialog (not frm.print_doc()'s full-page navigation) so the
						// preview matches the popup-with-print-button UX that was asked for.
						const dialog = new frappe.ui.Dialog({
							title: __("Receipt Preview"),
							size: "small",
							fields: [
								{
									fieldtype: "HTML",
									fieldname: "receipt_preview",
									options: receipt_html,
								},
							],
							primary_action_label: __("Print Receipt"),
							primary_action() {
								// A blank print-only window keeps the browser's print dialog
								// scoped to just the receipt, not the whole Desk page behind it.
								const print_window = window.open("", "_blank");
								print_window.document.write(
									`<html><head><title>${frappe.utils.escape_html(
										frm.doc.name
									)}</title></head><body>${receipt_html}</body></html>`
								);
								print_window.document.close();
								print_window.focus();
								print_window.print();
							},
						});
						dialog.show();
					},
				});
			});

			if (frm.doc.registration_category === "IP" && frm.doc.admission_status === "Discharged") {
				frm.add_custom_button(__("Discharge Summary"), () => {
					frappe.call({
						method:
							"metta.metta.doctype.patient_visit.patient_visit.get_discharge_defaults",
						args: { patient_visit: frm.doc.name },
						callback(r) {
							if (!r.message) return;
							frappe.new_doc("Discharge Summary", r.message);
						},
					});
				});
			}

			// Front Desk needs to check this mid-stay too (e.g. before deciding
			// whether more advance needs collecting), not only at discharge -
			// so this isn't gated on admission_status the way Discharge Summary is.
			if (frm.doc.registration_category === "IP") {
				frm.add_custom_button(__("Advance Summary"), () => {
					frappe.call({
						method:
							"metta.sales.doctype.patient_advance.patient_advance.get_advance_balance",
						args: { patient_visit: frm.doc.name },
						callback(r) {
							if (!r.message) return;
							const d = r.message;
							// A balance > 0 after everything's been billed means a refund
							// is owed - it never goes negative, since Billing's own
							// validate_advance_adjustment() caps advance_adjusted at
							// whatever's actually still available.
							frappe.msgprint({
								title: __("Advance Summary"),
								message: __(
									"Total Collected: {0}<br>Total Adjusted Against Bills: {1}<br><b>Balance: {2}</b>",
									[
										format_currency(d.total_collected),
										format_currency(d.total_adjusted),
										format_currency(d.balance),
									]
								)
							});
						},
					});
				});
			}
		}

		// Same reasoning as billing_category on Billing - an existing IP visit
		// loads with ward/room already set but the field's own change handler
		// never fires on load, so "Select Bed" would otherwise be missing
		// until the user re-touches the field.
		if (frm.doc.ward) {
			frappe.call({
				method: "metta.metta.doctype.patient_visit.patient_visit.get_ward_bed_summary",
				args: { ward: frm.doc.ward },
				callback(r) {
					if (r.message && r.message.total_beds !== undefined) render_ward_summary(frm, r.message);
				},
			});
		} else if (frm.doc.room) {
			frappe.call({
				method: "metta.metta.doctype.patient_visit.patient_visit.get_room_details",
				args: { room: frm.doc.room },
				callback(r) {
					if (r.message && r.message.capacity !== undefined) render_room_summary(frm, r.message);
				},
			});
		}

		if (frm.doc.registration_category === "IP" && !frm.is_new()) {
			render_bed_transfer_history(frm);
		}
	},

	ward(frm) {
		if (!frm.doc.ward) {
			frm.fields_dict.ward_bed_summary_html.$wrapper.html("");
			return;
		}
		frappe.call({
			method:
				"metta.metta.doctype.patient_visit.patient_visit.get_ward_bed_summary",
			args: { ward: frm.doc.ward },
			callback(r) {
				if (!r.message || r.message.total_beds === undefined) {
					return;
				}
				render_ward_summary(frm, r.message);
			},
		});
	},

	bed_no(frm) {
		// Only IP admissions occupy a bed - nothing to check for OP or an
		// incomplete ward/bed selection.
		if (!frm.doc.ward || !frm.doc.bed_no || frm.doc.registration_category !== "IP") {
			return;
		}
		const clicked_bed = frm.doc.bed_no;
		frappe.call({
			method:
				"metta.metta.doctype.patient_visit.patient_visit.check_bed_availability",
			args: {
				ward: frm.doc.ward,
				bed_no: frm.doc.bed_no,
				registration: frm.doc.name,
			},
			callback(r) {
				if (r.message && r.message.occupied) {
					frappe.msgprint({
						title: __("Bed Already Occupied"),
						indicator: "red",
						message: __(
							"Bed {0} in ward {1} is already occupied by {2}. Please choose a different bed.",
							[frm.doc.bed_no, frm.doc.ward, r.message.occupied_by]
						),
					});
					frm.set_value("bed_no", "");
					revert_bed_pending(frm.fields_dict.ward_bed_summary_html.$wrapper, clicked_bed);
				}
			},
		});
	},

	accommodation_type(frm) {
		// Ward and Room are mutually exclusive - clear whichever set of fields
		// no longer applies so a stale link can't linger and get saved.
		frm.fields_dict.ward_bed_summary_html.$wrapper.html("");
		frm.fields_dict.room_bed_summary_html.$wrapper.html("");
		if (frm.doc.accommodation_type === "Ward") {
			frm.set_value("room", "");
			frm.set_value("room_bed_no", "");
		} else if (frm.doc.accommodation_type === "Room") {
			frm.set_value("ward", "");
			frm.set_value("bed_no", "");
		}
	},

	room(frm) {
		if (!frm.doc.room) {
			frm.fields_dict.room_bed_summary_html.$wrapper.html("");
			return;
		}
		frappe.call({
			method:
				"metta.metta.doctype.patient_visit.patient_visit.get_room_details",
			args: { room: frm.doc.room },
			callback(r) {
				if (!r.message || r.message.capacity === undefined) {
					return;
				}
				render_room_summary(frm, r.message);
			},
		});
	},

	room_bed_no(frm) {
		// Only IP admissions occupy a bed - nothing to check for OP or an
		// incomplete room/bed selection.
		if (!frm.doc.room || !frm.doc.room_bed_no || frm.doc.registration_category !== "IP") {
			return;
		}
		const clicked_bed = frm.doc.room_bed_no;
		frappe.call({
			method:
				"metta.metta.doctype.patient_visit.patient_visit.check_room_availability",
			args: {
				room: frm.doc.room,
				room_bed_no: frm.doc.room_bed_no,
				registration: frm.doc.name,
			},
			callback(r) {
				if (r.message && r.message.occupied) {
					frappe.msgprint({
						title: __("Bed Already Occupied"),
						indicator: "red",
						message: __(
							"Bed {0} in room {1} is already occupied by {2}. Please choose a different bed.",
							[frm.doc.room_bed_no, frm.doc.room, r.message.occupied_by]
						),
					});
					frm.set_value("room_bed_no", "");
					revert_bed_pending(frm.fields_dict.room_bed_summary_html.$wrapper, clicked_bed);
				}
			},
		});
	},

	fee_amount(frm) {
		calculate_billing_totals(frm);
	},
	discount_percent(frm) {
		calculate_billing_totals(frm);
	},
	charity_amount(frm) {
		calculate_billing_totals(frm);
	},
	payment_mode(frm) {
		calculate_billing_totals(frm);
	},
	billing_category(frm) {
		// Charity Amount only ever applies to a General patient - Staff/Staff
		// Dependent already gets its charity automatically, so any leftover
		// hand-typed amount from before switching away from General is
		// cleared rather than silently carried over.
		if (frm.doc.billing_category !== "General" && frm.doc.charity_amount) {
			frm.set_value("charity_amount", 0);
		}
		if (!frm.doc.billing_category) {
			frm._category_adjustment = null;
			frm.set_value("discount_percent", 0);
			frm.set_value("adjustment_type", "");
			calculate_billing_totals(frm);
			return;
		}
		frappe.call({
			method: "metta.metta.doctype.patient_visit.patient_visit.get_category_adjustment",
			args: { billing_category: frm.doc.billing_category },
			callback(r) {
				const adjustment = r.message || null;
				frm._category_adjustment = adjustment;
				frm.set_value("discount_percent", (adjustment && adjustment.discount_percent) || 0);
				frm.set_value("adjustment_type", (adjustment && adjustment.adjustment_type) || "");
				calculate_billing_totals(frm);
			},
		});
	},
});

// Regular OPD hours end at 5:30 PM - anyone arriving after that is, by the
// hospital's own convention, an Emergency case regardless of whether it's
// their first visit or a return one.
const AFTER_HOURS_CUTOFF_MINUTES = 17 * 60 + 30;

// Time is a plain Data field (not Frappe's built-in Time fieldtype) so it can
// show 12-hour Indian clock time (e.g. "09:25:11 PM") - the Time fieldtype's
// own picker widget only supports 24-hour format, with no AM/PM option.
function parse_12h_time(time_str) {
	const match = /^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i.exec((time_str || "").trim());
	if (!match) return null;
	let hours = Number(match[1]) % 12;
	if (match[4].toUpperCase() === "PM") hours += 12;
	return { hours, minutes: Number(match[2]), seconds: Number(match[3]) };
}

function is_after_hours(time_str) {
	const parsed = parse_12h_time(time_str);
	if (!parsed) return false;
	return parsed.hours * 60 + parsed.minutes >= AFTER_HOURS_CUTOFF_MINUTES;
}

function ist_time_now_str() {
	// Explicit Asia/Kolkata, independent of the framework's own "Now"
	// default - that one actually prefers whatever timezone happens to be
	// set on the logged-in User's own profile over the site's, so a single
	// misconfigured account would otherwise silently throw off the 5:30 PM
	// cutoff. This hospital only ever operates on Indian time, so the Time
	// field's default is pinned to it directly, with no such dependency.
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Kolkata",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	}).formatToParts(new Date());
	const get = (type) => parts.find((p) => p.type === type).value;
	const hour12 = get("hour").padStart(2, "0");
	return `${hour12}:${get("minute")}:${get("second")} ${get("dayPeriod").toUpperCase()}`;
}

function suggest_registration_type(frm) {
	// Only meaningful for a brand-new OP visit - Registration Type isn't even
	// shown for IP, and an already-saved visit's fee category shouldn't
	// silently change just because someone reopens the record.
	if (!frm.doc.uhin_id || !frm.is_new() || frm.doc.registration_category === "IP") return;
	// Once Emergency applies - because it's past 5:30 PM, or Front Desk
	// picked it by hand - it's kept even if this runs again later with an
	// earlier time typed in; a manual Emergency call is never silently
	// downgraded back to General.
	const already_emergency = (frm.doc.registration_type || "").startsWith("Emergency");
	const is_emergency = already_emergency || is_after_hours(frm.doc.time);
	frappe.call({
		method: "metta.metta.doctype.patient_visit.patient_visit.has_prior_visit_of_type",
		args: { uhin_id: frm.doc.uhin_id, emergency: is_emergency ? 1 : 0 },
		callback(r) {
			// New Reg vs Revisit is tracked separately per General/Emergency -
			// a patient who's only ever come in during regular hours is still
			// a first-time Emergency visit (New Reg) the first time they show
			// up after 5:30 PM, not a Revisit.
			const prefix = is_emergency ? "Emergency" : "General";
			const suffix = r.message ? "Revisit" : "New Reg";
			frm.set_value("registration_type", `${prefix} ${suffix}`);
		},
	});
}

function bed_tile_html(bed) {
	// Each tile shows a bed icon (not just a plain colored box) - no icon
	// font/asset loading needed since it's a plain emoji.
	const is_available = bed.status === "Available";
	const bg = is_available ? "#28a745" : "#dc3545";
	return `
		<div class="bed-tile" data-bed="${frappe.utils.escape_html(bed.bed_no)}" data-available="${is_available}"
			title="${frappe.utils.escape_html(bed.status)}"
			style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
				width:56px; height:56px; margin:4px; border-radius:6px;
				background:${bg}; color:#fff; font-size:11px; font-weight:bold;
				cursor:${is_available ? "pointer" : "not-allowed"}; opacity:${is_available ? "1" : "0.55"};">
			<span style="font-size:18px; line-height:1;">🛏️</span>
			<span>${frappe.utils.escape_html(bed.bed_no)}</span>
		</div>`;
}

function bed_grid_html(beds) {
	// A ward with 30-40 beds shown as tiles all the time would flood the
	// form - so only a compact available/occupied count shows by default,
	// and the actual tile grid stays collapsed until asked for.
	const available_count = beds.filter((b) => b.status === "Available").length;
	const occupied_count = beds.length - available_count;

	return `
		<div class="bed-summary-toggle" style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;
			border:1px solid var(--border-color,#d1d8dd); border-radius:20px; padding:4px 12px 4px 8px; width:fit-content;">
			<span style="font-size:16px;">🛏️</span>
			<span style="color:#28a745; font-weight:bold;">${available_count} ${__("available")}</span>,
			<span style="color:#dc3545; font-weight:bold;">${occupied_count} ${__("occupied")}</span>
			<span class="text-muted" style="font-size:12px;">&mdash; ${__("click to view beds")}</span>
		</div>
		<div class="bed-grid-body" style="display:none; border:1px solid var(--border-color,#d1d8dd); border-radius:8px; padding:10px; margin-top:6px;">
			<div style="display:flex; flex-wrap:wrap;">${beds.map(bed_tile_html).join("")}</div>
			<div style="margin-top:8px; font-size:12px;">
				<span style="display:inline-block; width:12px; height:12px; background:#28a745; border-radius:3px; margin-right:4px;"></span>${__("Available")}
				<span style="display:inline-block; width:12px; height:12px; background:#dc3545; border-radius:3px; margin:0 4px 0 16px;"></span>${__("Occupied")}
			</div>
		</div>
		<div style="margin-bottom:10px;"></div>`;
}

function bind_bed_tiles($wrapper, on_select) {
	$wrapper.find(".bed-summary-toggle").on("click", () => {
		$wrapper.find(".bed-grid-body").slideToggle(150);
	});
	// Occupied tiles simply don't call on_select - "not clickable" in spirit,
	// since a plain div has no disabled state of its own to rely on.
	$wrapper.find(".bed-tile").on("click", function () {
		if (!$(this).data("available")) return;
		// Nothing is saved yet at this point - this is only a preview so
		// clicking feels instant instead of waiting on the availability
		// round-trip below. mark_bed_pending()/revert_bed_pending() are what
		// undo this if that check comes back occupied, so it never lies
		// about a bed actually being taken.
		mark_bed_pending($wrapper, $(this).data("bed"));
		on_select($(this).data("bed"));
	});
}

function mark_bed_pending($wrapper, bed_no) {
	// Only one bed can be picked for this visit - clear any earlier pending
	// look before applying it to the new one, same as the field itself only
	// ever holding one value.
	$wrapper.find(".bed-tile").each(function () {
		if ($(this).data("available")) {
			$(this).css({ background: "#28a745", cursor: "pointer", opacity: 1 });
		}
	});
	$wrapper
		.find(`.bed-tile[data-bed="${frappe.utils.escape_html(String(bed_no))}"]`)
		.css({ background: "#dc3545", cursor: "not-allowed", opacity: 1 })
		.attr("title", __("Selected (not saved yet)"));
}

function revert_bed_pending($wrapper, bed_no) {
	// The availability check rejected it after all - back to how it looked
	// before the click, since nothing was actually reserved.
	$wrapper
		.find(`.bed-tile[data-bed="${frappe.utils.escape_html(String(bed_no))}"]`)
		.css({ background: "#28a745", cursor: "pointer", opacity: 1 })
		.attr("title", __("Available"));
}

function render_ward_summary(frm, data) {
	const { beds } = data;
	// Rendered right next to Bed No itself (an HTML field placed directly
	// after it) rather than frm.set_intro() at the top of the form - the
	// grid and the field it fills in should be in the same glance.
	const $wrapper = frm.fields_dict.ward_bed_summary_html.$wrapper;

	if (!beds || !beds.length) {
		// Only wards with an enumerated bed list (see Ward Master) have
		// anything to actually pick from - others only have a manual count.
		$wrapper.html(
			`<div style="color:#888; margin-bottom:10px;">${__(
				"Individual beds are not listed for this ward yet — add them under Beds on the Ward Master record to see bed-wise status here."
			)}</div>`
		);
		return;
	}

	$wrapper.html(bed_grid_html(beds));
	// A fresh .html() call just replaced the whole wrapper, so there's no
	// stale handler to worry about - the old tiles (and their listeners) are
	// gone along with the old DOM they were attached to.
	bind_bed_tiles($wrapper, (bed_no) => frm.set_value("bed_no", bed_no));
}

function render_room_summary(frm, data) {
	const { beds } = data;
	const $wrapper = frm.fields_dict.room_bed_summary_html.$wrapper;

	if (!beds || !beds.length) {
		$wrapper.html(
			`<div style="color:#888; margin-bottom:10px;">${__(
				"Individual beds are not listed for this room yet — add them under Beds on the Room Master record to see bed-wise status here."
			)}</div>`
		);
		return;
	}

	$wrapper.html(bed_grid_html(beds));
	bind_bed_tiles($wrapper, (bed_no) => frm.set_value("room_bed_no", bed_no));
}

function render_bed_transfer_history(frm) {
	const $wrapper = frm.fields_dict.bed_transfer_history_html.$wrapper;
	frappe.call({
		method: "metta.metta.doctype.patient_visit.patient_visit.get_bed_transfer_history",
		args: { patient_visit: frm.doc.name },
		callback(r) {
			const rows = r.message || [];
			if (!rows.length) {
				$wrapper.html(`<div class="text-muted">${__("No ward/bed transfers recorded for this admission yet.")}</div>`);
				return;
			}
			$wrapper.html(
				rows
					.map(
						(row) => `
					<div style="border-bottom:1px solid var(--border-color,#d1d8dd); padding:8px 0;">
						<div>
							<b>${frappe.datetime.str_to_user(row.transferred_on)}</b>
							&mdash; ${frappe.utils.escape_html(row.from_label)} &rarr; ${frappe.utils.escape_html(row.to_label)}
						</div>
						<div class="text-muted" style="font-size:12px;">
							${__("By")} ${frappe.utils.escape_html(row.transferred_by || "")}
							${row.reason ? ` &mdash; ${frappe.utils.escape_html(row.reason)}` : ""}
						</div>
					</div>`
					)
					.join("")
			);
		},
	});
}

function calculate_billing_totals(frm) {
	// Mirrors the server's calculate_billing_totals() exactly - a live
	// preview only, validate() on save is what's actually authoritative.
	const adjustment = frm._category_adjustment;
	const adjustment_type =
		adjustment && adjustment.discount_status === "Active" ? adjustment.adjustment_type : null;
	const raw_percent = ["Discount", "Increase"].includes(adjustment_type) ? flt(frm.doc.discount_percent) : 0;
	const signed_percent = adjustment_type === "Increase" ? -raw_percent : raw_percent;

	// A hand-typed Charity Amount wins over the percentage-based discount -
	// never both at once - capped at the fee itself so it can't go negative.
	const discount_amount = flt(frm.doc.charity_amount) > 0
		? Math.min(flt(frm.doc.charity_amount), flt(frm.doc.fee_amount))
		: (flt(frm.doc.fee_amount) * signed_percent) / 100;
	const net_amount = flt(frm.doc.fee_amount) - discount_amount;
	frm.set_value("discount_amount", discount_amount);
	frm.set_value("net_amount", net_amount);
}
