/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect, ReactNode } from 'react';

type RenderOnViewProps = {
  children: ReactNode;
  placeholder: ReactNode;
  rootMargin?: string;
};

/**
 * A wrapper component that uses an IntersectionObserver to only render its
 * children when it is near or within the viewport. Renders a placeholder
 * otherwise. This is used to lazy-load expensive components like 3D models.
 */
const RenderOnView = ({ children, placeholder, rootMargin = '400px' }: RenderOnViewProps) => {
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Fallback for environments where IntersectionObserver is not available
    if (!('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Trigger if the element is intersecting
        if (entry.isIntersecting) {
          setIsInView(true);
          // Stop observing once it's visible, we only need to load it once.
          observer.disconnect();
        }
      },
      {
        // Load the component when it's 400px away from the viewport
        rootMargin,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      // Clean up the observer when the component unmounts
      if (containerRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        observer.unobserve(containerRef.current);
      }
    };
  }, [rootMargin]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {isInView ? children : placeholder}
    </div>
  );
};

export default RenderOnView;