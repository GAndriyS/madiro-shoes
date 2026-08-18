import { createFileRoute } from '@tanstack/react-router';

import { IntakeFlow } from '../../components/intake/IntakeFlow';

export const Route = createFileRoute('/_app/intake')({
  component: () => <IntakeFlow />,
});
