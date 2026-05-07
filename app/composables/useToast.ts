import { useToast } from 'primevue/usetoast'

export const useAppToast = () => {
  const toast = useToast()
  return {
    success: (msg: string) => toast.add({ severity: 'success', summary: 'Éxito', detail: msg, life: 3000 }),
    error:   (msg: string) => toast.add({ severity: 'error',   summary: 'Error',  detail: msg, life: 4000 }),
    warn:    (msg: string) => toast.add({ severity: 'warn',    summary: 'Aviso',  detail: msg, life: 3500 }),
    info:    (msg: string) => toast.add({ severity: 'info',    summary: 'Info',   detail: msg, life: 3000 }),
  }
}
