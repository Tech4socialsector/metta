<template>
  <!-- Who made this record and who saved it last (Desk's timeline, short). -->
  <footer v-if="doc && doc.creation" class="flex flex-wrap justify-between gap-2 px-1 text-xs text-gray-500">
    <span>Created by {{ who(doc.owner) }} · {{ when(doc.creation) }}</span>
    <span v-if="doc.modified && doc.modified !== doc.creation">Last saved by {{ who(doc.modified_by) }} · {{ when(doc.modified) }}</span>
  </footer>
</template>

<script setup>
import { ref, watch } from 'vue'
import { call } from 'frappe-ui'

const props = defineProps({ doc: { type: Object, default: null } })

// Full names where this user may read them; otherwise the login id.
const names = ref({})
watch(
  () => [props.doc?.owner, props.doc?.modified_by],
  async (users) => {
    const ids = [...new Set(users.filter((u) => u && !(u in names.value)))]
    if (!ids.length) return
    try {
      const rows = await call('frappe.client.get_list', { doctype: 'User', filters: { name: ['in', ids] }, fields: ['name', 'full_name'], limit_page_length: ids.length })
      names.value = { ...names.value, ...Object.fromEntries(rows.map((r) => [r.name, r.full_name || r.name])) }
    } catch {
      // no read on User - ids are shown instead
    }
  },
  { immediate: true },
)
const who = (u) => names.value[u] || u || '—'

function when(v) {
  const d = new Date(String(v).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
</script>
