import { createFileRoute } from '@tanstack/react-router';

import { StubScreen } from '../../components/StubScreen';

export const Route = createFileRoute('/_app/my-sales')({
  component: () => <StubScreen titleKey="stubs.mySales" />,
});
