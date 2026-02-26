import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/media',
    },
    {
      path: '/media',
      name: 'media',
      component: () => import('../views/MediaView.vue'),
    },
    {
      path: '/peer-connection',
      name: 'peer-connection',
      component: () => import('../views/PeerConnection/PeerConnectionView.vue'),
    },
    {
      path: '/pc-server',
      name: 'pc-server',
      component: () => import('../views/PeerConnectionServer/PeerConnectionServerView.vue'),
    },
    { path: '/api', name: '/api', component: () => import('../views/Api/Api.vue') }
  ],
})

export default router
