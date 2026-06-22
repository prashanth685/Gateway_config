import { Routes, Route } from 'react-router'
import CompanyList from './pages/CompanyList'
import CompanyDetail from './pages/CompanyDetail'
import GatewayDetail from './pages/GatewayDetail'
import User from './components/User'
import TagsIcon from './components/Tags'

export default function App() {
  return (
    
    <Routes>
      <Route path="/" element={<CompanyList />} />
      <Route path="/companies/:companyId" element={<CompanyDetail />} />
      <Route path="/companies/:companyId/gateways/:gatewayId" element={<GatewayDetail />} />
      <Route path="/companies/:companyId/users" element={<User />} />
      <Route path="/companies/:companyId/tags" element={<TagsIcon />} />
      <Route path="*" element={<CompanyList />} />
    </Routes>
  )
}
