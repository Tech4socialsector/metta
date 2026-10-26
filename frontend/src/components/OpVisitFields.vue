<template>
  <!-- Patient Visit (OP) · date/time + "Consultation Details" -->
  <div :class="cardClass">
    <div v-if="!panel" class="flex flex-wrap items-center gap-2">
      <h2 class="text-[17px] font-semibold">{{ title }}</h2>
      <span class="rounded-md bg-accent-500 px-2 py-0.5 text-xs font-bold text-white">OP</span>
    </div>
    <FormSection title="Visit details" icon="stethoscope" :cols="cols">
      <!-- Two columns (New registration): Registration Type takes the whole
      row, then Date | Time and Department | Doctor pair up under it. -->
      <LinkField id="registration_type" v-model="visit.registration_type" doctype="Registration type Master" label="Registration Type" :class="cols === 2 ? 'span-row' : ''" />
      <TextField id="visit_date" v-model="visit.date" type="date" label="Date" />
      <TextField id="visit_time" v-model="visit.time" label="Time" />
      <LinkField id="department_name" v-model="visit.department_name" doctype="Department" label="Department Name" />
      <LinkField id="doctor_name" v-model="visit.doctor_name" doctype="Doctor Master" label="Doctor name" :filters="visit.department_name ? { department: visit.department_name } : null" />
    </FormSection>
  </div>

  <!-- Patient Visit (OP) · "Billing Category" (registration fee) -->
  <div :class="cardClass">
    <FormSection title="Registration fee" icon="indian-rupee" :cols="cols">
      <TextField id="fee_amount" :model-value="money(visit.fee_amount)" label="Fee Amount" readonly />
      <LinkField
        v-if="categoryEditable"
        id="visit_billing_category"
        :model-value="billingCategory"
        doctype="Category Price Adjustment"
        label="Billing Category"
       
        @update:model-value="$emit('update:billingCategory', $event)"
      />
      <TextField v-else id="visit_billing_category" :model-value="billingCategory" label="Billing Category" readonly />
      <template v-if="showCompany">
        <LinkField
          v-if="categoryEditable"
          id="company_name"
          :model-value="company"
          doctype="Corporate Customer"
          label="Company Name"
          @update:model-value="$emit('update:company', $event)"
        />
        <TextField v-else id="company_name" :model-value="company" label="Company Name" readonly />
      </template>
      <TextField id="adjustment_type" :model-value="visit.adjustment_type" label="Adjustment Type" readonly />
      <SelectField id="visit_currency" v-model="visit.default_currency" label="Billing Currency" :options="OPTIONS.default_currency" />
      <TextField id="visit_charity_percent" :model-value="visit.charity_percent" :label="ov.labels.value.percent" inputmode="decimal" :readonly="billingCategory !== 'General'" @update:model-value="ov.onCharityPercentInput" />
      <TextField v-if="billingCategory === 'General'" id="charity_amount" :model-value="visit.charity_amount" :label="ov.labels.value.amount" inputmode="decimal" @update:model-value="ov.onCharityAmountInput" />
      <!-- An Increase category (e.g. Woodstock) adds TDS on top - not a discount. -->
      <TextField id="discount_amount" :model-value="money(ov.totals.value.discount_amount)" :label="ov.totals.value.adjustmentType === 'Increase' ? 'TDS Amount' : 'Discount Amount'" readonly />
      <TextField id="net_amount" :model-value="money(ov.totals.value.net_amount)" label="Net Amount" readonly />
      <SelectField v-if="ov.totals.value.net_amount > 0" id="payment_mode" v-model="visit.payment_mode" label="Payment Mode" :options="OPTIONS.payment_mode" />
      <LinkField v-if="ov.totals.value.net_amount > 0 && visit.payment_mode === 'Credit - Corporate'" id="visit_corporate_customer" v-model="visit.corporate_customer" doctype="Corporate Customer" label="Corporate Customer" reqd />
    </FormSection>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import FormSection from '@/components/FormSection.vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import LinkField from '@/components/LinkField.vue'
import { OPTIONS, FIXED_BILLING_CATEGORIES, flt } from '@/data/registrationRules'

const props = defineProps({
  // the object returned by useOpVisit()
  ov: { type: Object, required: true },
  title: { type: String, default: "Today's visit" },
  billingCategory: { type: String, default: '' },
  company: { type: String, default: '' },
  // New OP visit: the visit's own Billing Category / Company Name are
  // editable Links, as in Desk. New registration: they mirror the patient.
  categoryEditable: Boolean,
  // Inside New registration's single "Today's OP Visit" section: no card
  // of its own, just small sub-headings.
  panel: Boolean,
  // With panel, in a wider column (New OP visit): three per row instead of two.
  wide: Boolean,
})
defineEmits(['update:billingCategory', 'update:company'])

const visit = props.ov.visit
// Two equal columns in New registration's narrow panel, three elsewhere.
const cols = computed(() => (props.panel && !props.wide ? 2 : 3))
const cardClass = computed(() => (props.panel ? 'flex flex-col gap-3' : 'flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5'))
// Desk depends_on for company_name
const showCompany = computed(() => !!props.billingCategory && !FIXED_BILLING_CATEGORIES.includes(props.billingCategory))

function money(v) {
  return `₹${flt(v).toFixed(2)}`
}
</script>
