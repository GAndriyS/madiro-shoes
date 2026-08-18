import { createFileRoute } from '@tanstack/react-router';

import { IntakeFlow } from '../../components/intake/IntakeFlow';

// Manual intake (S-1.2): the same flow as a scan, minus the camera. Distinct
// from /manual, which is the checkout flow — one receives pairs, the other
// sells them, and a single «ввести вручну» entry point cannot mean both.
export const Route = createFileRoute('/_app/intake-manual')({
  component: () => <IntakeFlow manual />,
});
