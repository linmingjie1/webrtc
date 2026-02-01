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
  ],
})

export default router
