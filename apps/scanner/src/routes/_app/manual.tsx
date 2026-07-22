import { createFileRoute } from '@tanstack/react-router';

import { CheckoutFlow } from '../../components/sale/CheckoutFlow';

// Manual pair entry (FR-S-15): the same checkout flow without the camera.
export const Route = createFileRoute('/_app/manual')({
  component: () => <CheckoutFlow manual />,
});
