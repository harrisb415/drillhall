import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { CourseIndexPage } from "@/features/course/CourseIndexPage";
import { LessonPage } from "@/features/course/LessonPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ExamPage } from "@/features/exam/ExamPage";
import { FlashcardsPage } from "@/features/flashcards/FlashcardsPage";
import { MarketingPage } from "@/features/marketing/MarketingPage";
import { QuizPage } from "@/features/quiz/QuizPage";
import { ReferencePage } from "@/features/reference/ReferencePage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { ProtectedLayout } from "@/routes/ProtectedRoute";

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
      </BrowserRouter>
    </QueryClientProvider>
  );
}
