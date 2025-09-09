/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// FIX: Replaced the incorrect and outdated triple-slash directive for @react-three/fiber types with a direct import. This correctly augments the JSX namespace and resolves all TypeScript errors related to unrecognized 3D components like `<mesh>`, `<group>`, etc., across the entire application.
import '@react-three/fiber';

/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);