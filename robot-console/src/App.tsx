import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SciencePet } from './components/SciencePet';
import { SiteHeader } from './components/SiteHeader';
import homeSchoolMd from './content/资料/家园共育.md?raw';
import honorsMd from './content/资料/奖项荣誉.md?raw';
import overviewMd from './content/资料/园所概览.md?raw';
import { InfoPage } from './pages/InfoPage';

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const LabPage = lazy(() => import('./pages/LabPage').then((module) => ({ default: module.LabPage })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo({ top: 0, behavior: 'auto' }), [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <div className="app-shell">
      <ScrollToTop />
      <SiteHeader />
      <Suspense fallback={<div className="route-loader" aria-label="正在加载页面" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        <Route
          path="/overview"
          element={
            <InfoPage
              eyebrow="认识国科二幼"
              title="园所概览"
              summary="从办园基础、教育理念到课程环境，了解国科二幼如何支持儿童主动学习与持续生长。"
              content={overviewMd}
            />
          }
        />
        <Route
          path="/honors"
          element={
            <InfoPage
              eyebrow="成长印记"
              title="奖项荣誉"
              summary="记录园所、教师与儿童共同沉淀的专业成果和教育实践。"
              content={honorsMd}
            />
          }
        />
        <Route
          path="/home-school"
          element={
            <InfoPage
              eyebrow="共同育见成长"
              title="家园共育"
              summary="让家庭与幼儿园围绕儿童的真实需要形成稳定、清晰的合作。"
              content={homeSchoolMd}
            />
          }
        />
          <Route path="/lab" element={<LabPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <SciencePet />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
