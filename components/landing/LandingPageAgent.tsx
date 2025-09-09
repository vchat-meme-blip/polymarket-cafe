/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import '@react-three/fiber';
import React from 'react';
import { Html } from '@react-three/drei';
import { VrmModel } from '../agents/VrmAvatar';
import styles from './Landing.module.css';

const Tooltip = ({ name, catchphrase }: { name: string, catchphrase: string }) => (
    <div className={styles.tooltip}>
        <div className={styles.tooltipName}>{name}</div>
        {catchphrase && <div className={styles.tooltipCatchphrase}>"{catchphrase}"</div>}
    </div>
);

type LandingPageAgentProps = {
    position: [number, number, number];
    scale: number;
    rotation: [number, number, number];
    modelUrl: string;
    idleUrl: string;
    triggerAnimationUrl: string;
    triggerKey: number;
    tooltipInfo: { name: string; catchphrase: string; };
    onPointerOver: () => void;
    onPointerOut: () => void;
    hovered: boolean;
    darkenFace?: boolean | number;
};

/**
 * An isolated component for rendering a single, non-interactive agent on the landing page.
 * It handles its own animations, hover effects, and tooltips.
 */
export default function LandingPageAgent({
    position, scale, rotation, modelUrl, idleUrl,
    triggerAnimationUrl, triggerKey, tooltipInfo,
    onPointerOver, onPointerOut, hovered, darkenFace
}: LandingPageAgentProps) {
    return (
        <group position={position} scale={scale} rotation={rotation} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
            <VrmModel
                modelUrl={modelUrl}
                idleUrl={idleUrl}
                triggerAnimationUrl={triggerAnimationUrl}
                triggerKey={triggerKey}
                darkenFace={darkenFace}
                disableAutoGrounding={true} /* Disable auto-grounding to maintain consistent positioning */
                verticalOffset={-0.1} /* Apply standard vertical offset for consistent ground level */
            />
            {hovered && <Html position={[0, -0.1, 0]} center><Tooltip {...tooltipInfo} /></Html>}
        </group>
    );
}