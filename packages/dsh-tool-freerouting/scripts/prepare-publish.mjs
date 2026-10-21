import { fileURLToPath } from 'node:url';
import { preparePublishInputs } from './publish-inputs.mjs';

await preparePublishInputs(fileURLToPath(new URL('..', import.meta.url)));
