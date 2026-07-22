import { createFileRoute } from '@tanstack/react-router';

import { CheckoutFlow } from '../../components/sale/CheckoutFlow';

export const Route = createFileRoute('/_app/sale')({
  component: () => <CheckoutFlow />,
});
