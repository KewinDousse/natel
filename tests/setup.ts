import { configure } from "@testing-library/react";

// Self-hosted CI runners and busy laptops run several suites at once: a page
// that renders in 200 ms alone can take over a second there.
configure({ asyncUtilTimeout: 5000 });
