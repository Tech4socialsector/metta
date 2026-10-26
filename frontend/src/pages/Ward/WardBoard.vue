<template>
  <AppLayout title="Wards and beds">
    <template #actions>
      <button type="button" class="h-9 rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60" :disabled="loading" @click="load">{{ loading ? 'Refreshing…' : 'Refresh' }}</button>
    </template>

    <p v-if="error" class="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>
    <p v-else-if="!board" class="text-gray-600">Loading…</p>

    <div v-else class="flex w-full flex-col gap-7">
      <p v-if="!board.wards.length && !board.rooms.length" class="text-gray-600">No wards or rooms are set up yet.</p>

      <!-- One section per ward -->
      <section v-for="w in board.wards" :key="w.name" class="flex flex-col gap-3" :aria-label="w.name">
        <SectionTitle :title="w.name" icon="bed-double">
          <span class="ml-auto rounded-full bg-white px-3 py-0.5 text-sm font-semibold text-brand-800">{{ countText(w, w.total_beds) }}</span>
        </SectionTitle>
        <BedTiles :beds="w.beds" :unlisted="w.unlisted" bed-field="bed_no" />
        <!-- Desk's message for a ward without an enumerated bed list -->
        <p v-if="!w.beds.length" class="text-sm text-gray-600">Individual beds are not listed for this ward yet — add them under Beds on the Ward Master record to see bed-wise status here.</p>
      </section>

      <!-- Rooms: fewer beds each, so one section with a heading per room -->
      <section v-if="board.rooms.length" class="flex flex-col gap-5" aria-label="Rooms">
        <SectionTitle title="Rooms" icon="door-closed" />
        <div v-for="r in board.rooms" :key="r.name" class="flex flex-col gap-3">
          <SubHeading icon="bed-single">
            <span>{{ r.name }}</span>
            <span class="font-medium normal-case tracking-normal text-gray-600">{{ [r.room_type, r.floor ? `Floor ${r.floor}` : '', r.is_active ? '' : 'Not active'].filter(Boolean).join(' · ') }}</span>
            <span class="ml-auto font-medium normal-case tracking-normal text-gray-700">{{ countText(r, r.capacity) }}</span>
          </SubHeading>
          <BedTiles :beds="r.beds" :unlisted="r.unlisted" bed-field="room_bed_no" />
          <p v-if="!r.beds.length" class="text-sm text-gray-600">Individual beds are not listed for this room yet — add them under Beds on the Room Master record to see bed-wise status here.</p>
        </div>
      </section>

      <!-- Admitted (e.g. just after "Admit Patient") with no ward or room picked yet -->
      <section v-if="board.unassigned.length" class="flex flex-col gap-3" aria-label="Admitted, no bed yet">
        <SectionTitle title="Admitted, no bed yet" icon="user-round">
          <span class="ml-auto rounded-full bg-white px-3 py-0.5 text-sm font-semibold text-brand-800">{{ board.unassigned.length }} waiting for a bed</span>
        </SectionTitle>
        <BedTiles :beds="[]" :unlisted="board.unassigned" bed-field="" />
      </section>
    </div>
  </AppLayout>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import SubHeading from '@/components/SubHeading.vue'
import { api, errorText } from '@/data/api'
import BedTiles from '@/components/ward/BedTiles.vue'

const board = ref(null)
const loading = ref(false)
const error = ref('')

// metta.vue.ward.get_bed_board: the same occupancy Desk's bed grid uses
// (Ward/Room Master get_bed_status_list - only Admitted IP visits hold a
// bed), plus the admitted visit in each occupied bed.
async function load() {
  loading.value = true
  error.value = ''
  try {
    board.value = await api('metta.vue.ward.get_bed_board')
  } catch (err) {
    error.value = errorText(err) || 'Could not load the wards. Please try again.'
  } finally {
    loading.value = false
  }
}

// With a bed list: Desk's grid counts (free tiles vs the rest). Without
// one: the master's own live counts against its typed total.
function countText(place, total) {
  if (place.beds.length) {
    const free = place.beds.filter((b) => b.status === 'Available').length
    return `${free} free · ${place.beds.length - free + place.unlisted.length} occupied`
  }
  return `${place.available_beds} free · ${place.occupied_beds} occupied${total ? ` of ${total}` : ''}`
}

onMounted(load)
</script>
