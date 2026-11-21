import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// The first render of a lazy route imports its modules: on a slow CI runner this exceeds the default 1 s.
configure({ asyncUtilTimeout: 5000 });
