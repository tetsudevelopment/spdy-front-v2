// Configuración global de locale para PrimeVue — se ejecuta sólo en cliente.
// Con esto todos los DatePicker, Calendar y componentes con fechas muestran
// nombres en español. firstDayOfWeek: 0 hace que las semanas arranquen en
// domingo, coherente con la regla de mallas (domingo a sábado).

import { usePrimeVue } from 'primevue/config'

export default defineNuxtPlugin(() => {
  const primevue = usePrimeVue()
  if (!primevue?.config) return
  primevue.config.locale = {
    ...(primevue.config.locale ?? {}),
    firstDayOfWeek: 0,
    dayNames: [
      'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado',
    ],
    dayNamesShort: [
      'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb',
    ],
    dayNamesMin: [
      'Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá',
    ],
    monthNames: [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ],
    monthNamesShort: [
      'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
    ],
    today: 'Hoy',
    clear: 'Limpiar',
    weekHeader: 'Sem',
    dateFormat: 'dd/mm/yy',
    am: 'a.m.',
    pm: 'p.m.',
  }
})
