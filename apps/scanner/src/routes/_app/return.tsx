import { createFileRoute } from '@tanstack/react-router';

import { StubScreen } from '../../components/StubScreen';

export const Route = createFileRoute('/_app/return')({
  component: () => <StubScreen titleKey="stubs.return" />,
});
