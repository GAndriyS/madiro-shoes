import { createFileRoute } from '@tanstack/react-router';

import { StubScreen } from '../../components/StubScreen';

export const Route = createFileRoute('/_app/sale')({
  component: () => <StubScreen titleKey="stubs.sale" />,
});
