<template>
  <div class="flex flex-col gap-5">
    <p v-if="!meta" class="text-gray-600">Loading…</p>
    <section v-for="(s, si) in sections" :key="si" class="rounded-xl border border-gray-200 bg-white">
      <component
        :is="s.collapsible ? 'button' : 'div'"
        :type="s.collapsible ? 'button' : undefined"
        class="block w-full px-5 pt-4 text-left"
        :class="collapsed[si] && 'pb-4'"
        :aria-expanded="s.collapsible ? !collapsed[si] : undefined"
        @click="s.collapsible && (collapsed[si] = !collapsed[si])"
      >
        <SubHeading v-if="s.label" :icon="sectionIcon(s.label)">
          {{ s.label }}
          <template v-if="s.collapsible" #end><span class="text-sm text-brand-700">{{ collapsed[si] ? 'Show' : 'Hide' }}</span></template>
        </SubHeading>
      </component>
      <div v-if="!collapsed[si]" class="px-5 pb-5 pt-3">
        <!-- Desk's field order, laid out as a compact grid; long fields
        take a whole row. Empty fields stay one click away, never removed. -->
        <dl v-if="shownFields(s, si).length" class="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-6 gap-y-4">
          <div v-for="df in shownFields(s, si)" :key="df.fieldname" class="min-w-0" :class="isWide(df) ? 'col-span-full' : ''">
            <dt class="text-xs font-medium uppercase tracking-wide text-gray-600">{{ df.label }}</dt>
            <dd v-if="df.fieldtype === 'Table' || df.fieldtype === 'Table MultiSelect'" class="mt-1.5">
              <ChildTable :rows="doc[df.fieldname] || []" :meta="byName[df.options]" />
            </dd>
            <dd v-else-if="df.fieldtype === 'Link' && linkRoute(df, doc[df.fieldname])" class="mt-0.5 text-[15px]">
              <router-link :to="linkRoute(df, doc[df.fieldname])" class="text-brand-700 hover:underline">{{ doc[df.fieldname] }}</router-link>
            </dd>
            <dd v-else class="mt-0.5 whitespace-pre-line break-words text-[15px]" :class="isEmpty(df) ? 'text-gray-500' : 'text-gray-900'">{{ formatValue(df, doc[df.fieldname]) }}</dd>
          </div>
        </dl>
        <p v-else class="text-sm text-gray-600">Nothing entered in this section.</p>
        <button
          v-if="emptyCount(s)"
          type="button"
          class="mt-3 text-sm font-semibold text-brand-700 hover:underline"
          :aria-expanded="!!showEmpty[si]"
          @click="showEmpty[si] = !showEmpty[si]"
        >
          {{ showEmpty[si] ? 'Hide empty fields' : `Show ${emptyCount(s)} empty field${emptyCount(s) === 1 ? '' : 's'}` }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import SubHeading from '@/components/SubHeading.vue'
import { sectionIcon } from '@/data/sectionIcon'
import { computed, h, reactive, ref, watchEffect } from 'vue'
import { getMeta, layoutSections, formatValue } from '@/data/meta'

const props = defineProps({
  doctype: { type: String, required: true },
  doc: { type: Object, required: true },
})

const meta = ref(null)
const byName = ref({})
const collapsed = reactive({})
const showEmpty = reactive({})

const WIDE_TYPES = ['Small Text', 'Text', 'Long Text', 'Text Editor', 'Code', 'Table', 'Table MultiSelect', 'Markdown Editor', 'HTML Editor']
function isWide(df) {
  return WIDE_TYPES.includes(df.fieldtype)
}
function isEmpty(df) {
  const v = props.doc[df.fieldname]
  if (Array.isArray(v)) return v.length === 0
  // An unticked Check is a real "No", not a blank.
  return v === null || v === undefined || v === ''
}
function emptyCount(s) {
  return s.columns.flat().filter(isEmpty).length
}
function shownFields(s, si) {
  const all = s.columns.flat()
  return showEmpty[si] ? all : all.filter((df) => !isEmpty(df))
}

watchEffect(async () => {
  const res = await getMeta(props.doctype)
  meta.value = res.meta
  byName.value = res.byName
})

// Desk's layout and depends_on, evaluated against this record.
const sections = computed(() => {
  if (!meta.value) return []
  const list = layoutSections(meta.value, props.doc)
  list.forEach((s, i) => {
    if (s.collapsible && collapsed[i] === undefined) collapsed[i] = true
  })
  return list
})

// Links to records that have their own Vue page open there.
function linkRoute(df, value) {
  if (!value) return null
  if (df.options === 'Patient Registration') return { name: 'PatientView', params: { uhin: value } }
  if (df.options === 'Patient Visit') return { name: 'VisitView', params: { name: value } }
  return null
}

// Child table: the columns Desk shows in its grid (in_list_view).
const ChildTable = (p) => {
  const cols = (p.meta?.fields || []).filter((f) => f.in_list_view && !f.hidden)
  if (!p.rows.length) return h('p', { class: 'text-sm text-gray-600' }, 'No rows')
  return h('div', { class: 'overflow-x-auto rounded-lg border border-gray-200' }, [
    h('table', { class: 'w-full min-w-[480px] border-collapse text-sm' }, [
      h('thead', h('tr', { class: 'bg-gray-50 text-left text-xs uppercase text-gray-600' }, [
        h('th', { class: 'px-3 py-2 font-semibold' }, '#'),
        ...cols.map((c) => h('th', { class: 'px-3 py-2 font-semibold' }, c.label)),
      ])),
      h('tbody', p.rows.map((r, i) => h('tr', { class: 'border-t border-gray-100' }, [
        h('td', { class: 'px-3 py-2 text-gray-600' }, i + 1),
        ...cols.map((c) => h('td', { class: 'px-3 py-2' }, formatValue(c, r[c.fieldname]))),
      ]))),
    ]),
  ])
}
ChildTable.props = ['rows', 'meta']
</script>
