import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { applySiteFavicon, getCachedSiteBranding } from './lib/branding'
import './style.css'

applySiteFavicon(getCachedSiteBranding().siteFavicon)

createApp(App).use(router).mount('#app')
