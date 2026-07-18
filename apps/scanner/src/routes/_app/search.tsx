import { createFileRoute } from '@tanstack/react-router';

import { StubScreen } from '../../components/StubScreen';

export const Route = createFileRoute('/_app/search')({
  component: () => <StubScreen titleKey="stubs.search" />,
});
