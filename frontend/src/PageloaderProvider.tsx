import Modal from '@mui/material/Modal';
import Progress from '@mui/material/CircularProgress';

export function PageLoader() {
  return <Modal
    open={true}
  >
    <Progress />
  </Modal>
}
