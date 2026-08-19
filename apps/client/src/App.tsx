import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Spinner } from "@/components/ui/spinner";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { MarketingPage } from "@/features/marketing/MarketingPage";
import { ProtectedLayout } from "@/routes/ProtectedRoute";

// Everything behind the auth gate is loaded on demand — marketing/login stay
// in the initial bundle since that's the first thing a signed-out visitor
// sees, but a signed-in user only pays for the feature areas they visit.
const DashboardPage = lazy(() =>
  import("@/features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const CourseIndexPage = lazy(() =>
  import("@/features/course/CourseIndexPage").then((m) => ({ default: m.CourseIndexPage })),
);
const LessonPage = lazy(() =>
  import("@/features/course/LessonPage").then((m) => ({ default: m.LessonPage })),
);
const FlashcardsPage = lazy(() =>
  import("@/features/flashcards/FlashcardsPage").then((m) => ({ default: m.FlashcardsPage })),
);
const QuizPage = lazy(() => import("@/features/quiz/QuizPage").then((m) => ({ default: m.QuizPage })));
const ExamPage = lazy(() => import("@/features/exam/ExamPage").then((m) => ({ default: m.ExamPage })));
const ReferencePage = lazy(() =>
  import("@/features/reference/ReferencePage").then((m) => ({ default: m.ReferencePage })),
);
const SettingsPage = lazy(() =>
  import("@/features/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const AdminPage = lazy(() => import("@/features/admin/AdminPage").then((m) => ({ default: m.AdminPage })));

function RouteFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* public */}
            <Route path="/" element={<MarketingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* everything else requires a session */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/course" element={<CourseIndexPage />} />
              <Route path="/course/:lessonId" element={<LessonPage />} />
              <Route path="/flashcards" element={<FlashcardsPage />} />
              <Route path="/quiz" element={<QuizPage />} />
              <Route path="/exam" element={<ExamPage />} />
              <Route path="/reference" element={<ReferencePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              {/* AdminPage redirects non-admins itself; the real gate is server-side. */}
              <Route path="/admin" element={<AdminPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
