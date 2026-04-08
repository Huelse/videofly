import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

import { authStore } from "./stores/auth";

type AppRouteMeta = {
  public?: boolean;
  publicOnly?: boolean;
  requiresAdmin?: boolean;
};

const dashboardChildren: RouteRecordRaw[] = [
  {
    path: "",
    redirect: { name: "dashboard-videos" }
  },
  {
    path: "me",
    name: "dashboard-me",
    component: () => import("./pages/dashboard/DashboardProfilePage.vue")
  },
  {
    path: "videos",
    name: "dashboard-videos",
    component: () => import("./pages/dashboard/DashboardVideosPage.vue")
  },
  {
    path: "videos/:id",
    name: "dashboard-video-detail",
    component: () => import("./pages/dashboard/DashboardVideoDetailPage.vue")
  },
  {
    path: "upload",
    name: "dashboard-upload",
    component: () => import("./pages/dashboard/DashboardUploadPage.vue")
  },
  {
    path: "oss",
    name: "dashboard-oss",
    component: () => import("./pages/dashboard/DashboardOssFilesPage.vue"),
    meta: { requiresAdmin: true } satisfies AppRouteMeta
  },
  {
    path: "users",
    name: "dashboard-users",
    component: () => import("./pages/dashboard/DashboardUsersPage.vue"),
    meta: { requiresAdmin: true } satisfies AppRouteMeta
  }
];

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("./pages/HomePage.vue"),
    meta: { public: true, publicOnly: true } satisfies AppRouteMeta
  },
  {
    path: "/login",
    name: "login",
    component: () => import("./pages/LoginPage.vue"),
    meta: { public: true, publicOnly: true } satisfies AppRouteMeta
  },
  {
    path: "/register",
    name: "register",
    component: () => import("./pages/RegisterPage.vue"),
    meta: { public: true, publicOnly: true } satisfies AppRouteMeta
  },
  {
    path: "/dashboard",
    component: () => import("./pages/dashboard/DashboardLayout.vue"),
    children: dashboardChildren
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  if (!authStore.initialized) {
    await authStore.bootstrap();
  }

  const meta = to.meta as AppRouteMeta;
  const isAuthenticated = authStore.isAuthenticated.value;

  if (!meta.public && !isAuthenticated) {
    return { name: "login" };
  }

  if (meta.publicOnly && isAuthenticated) {
    return { name: "dashboard-videos" };
  }

  if (meta.requiresAdmin && authStore.currentUser.value?.role !== "ADMIN") {
    return { name: "dashboard-videos" };
  }

  return true;
});

export default router;
