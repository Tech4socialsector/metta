<template>
  <!-- Patient Visit "IP Details": accommodation, ward/room and bed, with
  Desk's bed grid. Edits the visit object passed in, in place. -->
  <div class="flex flex-col gap-4">
    <div class="row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6">
      <SelectField id="accommodation_type" v-model="doc.accommodation_type" label="Accommodation Type" :options="VISIT_OPTIONS.accommodation_type" :readonly="readonly" />
    </div>

    <template v-if="doc.accommodation_type === 'Ward'">
      <div class="row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6">
        <LinkField id="ward" v-model="doc.ward" doctype="Ward Master" label="Ward" :readonly="readonly" />
        <TextField id="bed_no" v-model="doc.bed_no" label="Bed No" :readonly="readonly" @change="checkWardBed" />
      </div>
      <BedGrid v-if="doc.ward && !readonly" :model-value="doc.bed_no || ''" :beds="wardBeds" :loading="loading" kind="ward" @update:model-value="pickWardBed" />
    </template>

    <template v-if="doc.accommodation_type === 'Room'">
      <div class="row-fit grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 min-[1280px]:grid-cols-6">
        <!-- setup(): only active rooms are offered -->
        <LinkField id="room" v-model="doc.room" doctype="Room Master" label="Room" :filters="{ is_active: 1 }" :readonly="readonly" />
        <TextField id="room_bed_no" v-model="doc.room_bed_no" label="Bed No" :readonly="readonly" @change="checkRoomBed" />
      </div>
      <p v-if="roomInfo" class="text-sm text-gray-700">
        {{ [roomInfo.room_type, roomInfo.floor ? `Floor ${roomInfo.floor}` : '', roomInfo.rent_per_day ? `${money(roomInfo.rent_per_day)}/day` : '', roomInfo.capacity ? `Capacity ${roomInfo.capacity}` : ''].filter(Boolean).join(' · ') }}
      </p>
      <BedGrid v-if="doc.room && !readonly" :model-value="doc.room_bed_no || ''" :beds="roomBeds" :loading="loading" kind="room" @update:model-value="pickRoomBed" />
    </template>

    <p v-if="bedError" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      <b>Bed Already Occupied.</b> {{ bedError }}
    </p>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import TextField from '@/components/TextField.vue'
import SelectField from '@/components/SelectField.vue'
import LinkField from '@/components/LinkField.vue'
import BedGrid from '@/components/BedGrid.vue'
import { api, errorText, VISIT } from '@/data/api'
import { VISIT_OPTIONS, money } from '@/data/ward/rules'

const props = defineProps({
  // the Patient Visit being edited (reactive; changed in place)
  doc: { type: Object, required: true },
  // the visit as last saved - its own bed is not "taken" from itself
  original: { type: Object, required: true },
  readonly: Boolean,
})

// The page remounts this component for every freshly loaded visit; until
// then, changes coming from a newly loaded record must not clear its beds.
const ownDoc = props.doc
const isOwn = () => props.doc === ownDoc

const wardBeds = ref([])
const roomBeds = ref([])
const roomInfo = ref(null)
const loading = ref(false)
const bedError = ref('')

// The grid comes from the server with this visit's own saved bed marked
// Occupied (by this very patient). Shown as free here, so staying in the
// same bed is "Chosen", not blocked.
function ownBedFree(beds, place, placeField, bedField) {
  const o = props.original
  if (o.admission_status !== 'Admitted' || o[placeField] !== place) return beds
  return beds.map((b) => (b.bed_no === o[bedField] ? { ...b, status: 'Available' } : b))
}

async function loadWard(ward) {
  wardBeds.value = []
  if (!ward) return
  loading.value = true
  try {
    const r = await api(`${VISIT}.get_ward_bed_summary`, { ward })
    if (props.doc.ward === ward) wardBeds.value = ownBedFree(r?.beds || [], ward, 'ward', 'bed_no')
  } catch (err) {
    bedError.value = errorText(err)
  } finally {
    loading.value = false
  }
}

async function loadRoom(room) {
  roomBeds.value = []
  roomInfo.value = null
  if (!room) return
  loading.value = true
  try {
    const r = await api(`${VISIT}.get_room_details`, { room })
    if (props.doc.room !== room) return
    roomInfo.value = r
    roomBeds.value = ownBedFree(r?.beds || [], room, 'room', 'room_bed_no')
  } catch (err) {
    bedError.value = errorText(err)
  } finally {
    loading.value = false
  }
}

// refresh(): an existing visit shows its ward's (or room's) grid straight away.
onMounted(() => {
  if (props.doc.ward) loadWard(props.doc.ward)
  else if (props.doc.room) loadRoom(props.doc.room)
})

// accommodation_type: Ward and Room are mutually exclusive - the other
// side is cleared so a stale link can't be saved.
watch(() => props.doc.accommodation_type, (type) => {
  if (!isOwn()) return
  bedError.value = ''
  if (type === 'Ward') {
    props.doc.room = ''
    props.doc.room_bed_no = ''
  } else if (type === 'Room') {
    props.doc.ward = ''
    props.doc.bed_no = ''
  }
})

// A bed number belongs to its ward/room, so a new ward starts with no bed.
watch(() => props.doc.ward, (ward) => {
  if (!isOwn()) return
  bedError.value = ''
  props.doc.bed_no = ''
  loadWard(ward)
})
watch(() => props.doc.room, (room) => {
  if (!isOwn()) return
  bedError.value = ''
  props.doc.room_bed_no = ''
  loadRoom(room)
})

function pickWardBed(bed) {
  props.doc.bed_no = bed
  checkWardBed()
}
function pickRoomBed(bed) {
  props.doc.room_bed_no = bed
  checkRoomBed()
}

// bed_no -> check_bed_availability (this visit itself excluded). The server
// re-checks on save; this only gives Desk's instant message.
async function checkWardBed() {
  bedError.value = ''
  const { ward, bed_no: bed } = props.doc
  if (!ward || !bed) return
  try {
    const r = await api(`${VISIT}.check_bed_availability`, { ward, bed_no: bed, registration: props.doc.name })
    if (r?.occupied && props.doc.bed_no === bed) {
      bedError.value = `Bed ${bed} in ward ${ward} is already occupied by ${r.occupied_by}. Please choose a different bed.`
      props.doc.bed_no = ''
    }
  } catch {
    // The server re-checks on save.
  }
}

// room_bed_no -> check_room_availability
async function checkRoomBed() {
  bedError.value = ''
  const { room, room_bed_no: bed } = props.doc
  if (!room || !bed) return
  try {
    const r = await api(`${VISIT}.check_room_availability`, { room, room_bed_no: bed, registration: props.doc.name })
    if (r?.occupied && props.doc.room_bed_no === bed) {
      bedError.value = `Bed ${bed} in room ${room} is already occupied by ${r.occupied_by}. Please choose a different bed.`
      props.doc.room_bed_no = ''
    }
  } catch {
    // The server re-checks on save.
  }
}

defineExpose({ reload: () => (props.doc.ward ? loadWard(props.doc.ward) : props.doc.room ? loadRoom(props.doc.room) : null) })
</script>
