import { createFileRoute } from '@tanstack/react-router';

import { StubScreen } from '../../components/StubScreen';

export const Route = createFileRoute('/_app/my-drafts')({
  component: () => <StubScreen titleKey="stubs.myDrafts" />,
});
