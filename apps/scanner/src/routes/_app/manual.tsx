import { createFileRoute } from '@tanstack/react-router';

import { StubScreen } from '../../components/StubScreen';

export const Route = createFileRoute('/_app/manual')({
  component: () => <StubScreen titleKey="stubs.manual" />,
});
