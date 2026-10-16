import { createFileRoute } from '@tanstack/react-router';

import { ReturnFlow } from '../../components/return/ReturnFlow';

export const Route = createFileRoute('/_app/return')({
  component: () => <ReturnFlow />,
});
