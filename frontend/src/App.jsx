import { Routes, Route } from 'react-router'
import CompanyList from './pages/CompanyList'
import CompanyDetail from './pages/CompanyDetail'
import GatewayDetail from './pages/GatewayDetail'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CompanyList />} />
      <Route path="/companies/:companyId" element={<CompanyDetail />} />
      <Route path="/companies/:companyId/gateways/:gatewayId" element={<GatewayDetail />} />
      <Route path="*" element={<CompanyList />} />
    </Routes>
  )
}
