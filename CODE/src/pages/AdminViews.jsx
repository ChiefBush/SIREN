import { useParams } from 'react-router-dom'
import MinerDashboard from './MinerDashboard'
import SupervisorDashboard from './SupervisorDashboard'

export function AdminMinerView({ onLogout }) {
    const { minerId } = useParams()
    return (
        <MinerDashboard
            onLogout={onLogout}
            userId={minerId}
            isReadOnly={false}
            isAdminView={true}
        />
    )
}

export function AdminSupervisorView({ onLogout }) {
    const { supervisorId } = useParams()
    return (
        <SupervisorDashboard
            onLogout={onLogout}
            userId={supervisorId}
            isAdminView={true}
        />
    )
}
