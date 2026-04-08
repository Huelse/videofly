import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

import { authStore } from "./stores/auth";

type AppRouteMeta = {
  public?: boolean;
  publicOnly?: boolean;
  requiresAdmin?: boolean;
  requiresUpload?: boolean;
};

const dashboardChildren: RouteRecordRaw[] = [
  {
    path: "",
    redirect: { name: "dashboard-me" }
  },
  {
    path: "me",
    name: "dashboard-me",
    component: () => import("./pages/dashboard/DashboardProfilePage.vue")
  },
  {
    path: "my-videos",
    name: "dashboard-my-videos",
    component: () => import("./pages/dashboard/DashboardMyVideosPage.vue"),
    meta: { requiresUpload: true } satisfies AppRouteMeta
  },
  {
    path: "videos/:id",
    name: "dashboard-video-detail",
    component: () => import("./pages/dashboard/DashboardVideoDetailPage.vue")
  },
  {
    path: "upload",
    name: "dashboard-upload",
    component: () => import("./pages/dashboard/DashboardUploadPage.vue"),
    meta: { requiresUpload: true } satisfies AppRouteMeta
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
    path: "/feed",
    name: "feed",
    component: () => import("./pages/VideoFeedPage.vue")
  },
  {
    path: "/dashboard",
    component: () => import("./pages/dashboard/DashboardLayout.vue"),
    children: dashboardChildren
  },
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("./pages/NotFoundPage.vue"),
    meta: { public: true } satisfies AppRouteMeta
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
    return { name: "dashboard-me" };
  }

  if (meta.requiresAdmin && authStore.currentUser.value?.role !== "ADMIN") {
    return { name: "dashboard-me" };
  }

  if (meta.requiresUpload && !authStore.canUpload.value) {
    return { name: "feed" };
  }

  return true;
});

export default router;
