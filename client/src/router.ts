import { createRouter, createWebHistory } from "vue-router";

import { authStore } from "./stores/auth";
import DashboardLayout from "./pages/DashboardLayout.vue";
import DashboardOssFilesPage from "./pages/DashboardOssFilesPage.vue";
import DashboardVideoDetailPage from "./pages/DashboardVideoDetailPage.vue";
import DashboardUsersPage from "./pages/DashboardUsersPage.vue";
import DashboardVideosPage from "./pages/DashboardVideosPage.vue";
import DashboardUploadPage from "./pages/DashboardUploadPage.vue";
import HomePage from "./pages/HomePage.vue";
import LoginPage from "./pages/LoginPage.vue";
import RegisterPage from "./pages/RegisterPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomePage,
      meta: { public: true }
    },
    {
      path: "/login",
      name: "login",
      component: LoginPage,
      meta: { public: true }
    },
    {
      path: "/register",
      name: "register",
      component: RegisterPage,
      meta: { public: true }
    },
    {
      path: "/dashboard",
      component: DashboardLayout,
      children: [
        {
          path: "",
          redirect: "/dashboard/videos"
        },
        {
          path: "videos",
          name: "dashboard-videos",
          component: DashboardVideosPage
        },
        {
          path: "videos/:id",
          name: "dashboard-video-detail",
          component: DashboardVideoDetailPage
        },
        {
          path: "upload",
          name: "dashboard-upload",
          component: DashboardUploadPage
        },
        {
          path: "oss",
          name: "dashboard-oss",
          component: DashboardOssFilesPage
        },
        {
          path: "users",
          name: "dashboard-users",
          component: DashboardUsersPage
        }
      ]
    }
  ]
});

router.beforeEach(async (to) => {
  if (!authStore.initialized) {
    await authStore.bootstrap();
  }

  const isPublicRoute = Boolean(to.meta.public);

  if (!isPublicRoute && !authStore.isAuthenticated.value) {
    return { name: "login" };
  }

  if (isPublicRoute && authStore.isAuthenticated.value) {
    return { name: "dashboard-videos" };
  }

  if ((to.name === "dashboard-users" || to.name === "dashboard-oss") && authStore.currentUser.value?.role !== "ADMIN") {
    return { name: "dashboard-videos" };
  }

  return true;
});

export default router;
