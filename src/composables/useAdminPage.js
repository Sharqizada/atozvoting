import { onMounted, ref } from 'vue'
import { fetchJson } from '../lib/api'

export const useAdminPage = (endpoint, initialState) => {
  const data = ref(initialState)
  const loading = ref(true)
  const error = ref('')

  const load = async () => {
    loading.value = true
    error.value = ''

    try {
      data.value = await fetchJson(endpoint)
    } catch (requestError) {
      error.value = requestError.message || 'Unable to load data.'
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  return {
    data,
    loading,
    error,
    load,
  }
}
