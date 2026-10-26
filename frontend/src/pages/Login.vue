<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
    <form
      class="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200"
      @submit.prevent="submit"
    >
      <!-- Same logo as the CHW app's login. -->
      <div class="flex flex-col items-center gap-2 pb-2">
        <img :src="logo" alt="" class="h-28 w-28 object-contain" />
        <h1 class="text-xl font-bold tracking-tight text-brand-800">LCH HMIS</h1>
      </div>
      <FormControl
        v-model="email"
        label="Email or Username"
        type="text"
        autocomplete="username"
        required
      />
      <FormControl
        v-model="password"
        label="Password"
        type="password"
        autocomplete="current-password"
        required
      />
      <ErrorMessage :message="loginResource.error" />
      <Button
        variant="solid"
        type="submit"
        class="w-full !bg-brand-700 hover:!bg-brand-800"
        :loading="loginResource.loading"
      >
        Log in
      </Button>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Button, ErrorMessage, FormControl } from 'frappe-ui'
import { loginResource } from '@/data/session'

const logo = `${import.meta.env.BASE_URL}logo-full.png`

const email = ref('')
const password = ref('')

function submit() {
  loginResource.submit({ email: email.value, password: password.value })
}
</script>
