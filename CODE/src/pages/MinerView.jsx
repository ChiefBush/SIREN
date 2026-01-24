import { useParams } from 'react-router-dom'
import MinerDashboard from './MinerDashboard'

function MinerView({ onLogout }) {
  const { minerId } = useParams()

  return <MinerDashboard onLogout={onLogout} userId={minerId} isReadOnly={true} />
}

export default MinerView

