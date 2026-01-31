import { logger } from "./logger";

/**
 * Script integrity verification utilities
 */
export class ScriptIntegrity {
  /**
   * Calculate SHA-256 hash of script content
   */
  static async calculateHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Verify script signature (basic implementation)
   * In production, this should use proper digital signatures
   */
  static async verifySignature(
    content: string,
    expectedHash?: string,
  ): Promise<boolean> {
    if (!expectedHash) {
      logger.warn("No expected hash provided for signature verification");
      return false;
    }

    try {
      const actualHash = await this.calculateHash(content);
      const isValid = actualHash === expectedHash;

      if (!isValid) {
        logger.error(
          `Hash verification failed. Expected: ${expectedHash}, Actual: ${actualHash}`,
        );
      }

      return isValid;
    } catch (error) {
      logger.error("Failed to verify script signature:", error);
      return false;
    }
  }

  /**
   * Validate script content for security issues
   */
  static validateSecurity(code: string): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
      { pattern: /eval\s*\(/, message: "Use of eval() detected" },
      {
        pattern: /Function\s*\(/,
        message: "Use of Function() constructor detected",
      },
      {
        pattern: /document\.write\s*\(/,
        message: "Use of document.write() detected",
      },
      {
        pattern: /innerHTML\s*=/,
        message: "Direct innerHTML assignment detected",
      },
      {
        pattern: /outerHTML\s*=/,
        message: "Direct outerHTML assignment detected",
      },
      {
        pattern: /setTimeout\s*\(\s*["']/,
        message: "String-based setTimeout detected",
      },
      {
        pattern: /setInterval\s*\(\s*["']/,
        message: "String-based setInterval detected",
      },
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(code)) {
        warnings.push(message);
      }
    }

    // Check for excessive size
    if (code.length > 10 * 1024 * 1024) {
      // 10MB
      warnings.push("Script size is very large (>10MB)");
    }

    // Check for suspicious URL patterns
    const suspiciousUrls = code.match(/https?:\/\/[^\s"']+/g) || [];
    const suspiciousDomains = ["bit.ly", "tinyurl.com", "short.link"];
    for (const url of suspiciousUrls) {
      if (suspiciousDomains.some((domain) => url.includes(domain))) {
        warnings.push(`Suspicious URL shortener detected: ${url}`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Extract and verify metadata hash from script
   */
  static extractMetadataHash(code: string): string | null {
    const hashMatch = code.match(/\/\/\s*@hash\s+(.+)/i);
    return hashMatch ? hashMatch[1].trim() : null;
  }

  /**
   * Complete integrity check for script update
   */
  static async performIntegrityCheck(
    newCode: string,
    oldHash?: string,
    expectedHash?: string,
  ): Promise<{
    valid: boolean;
    actualHash: string;
    securityWarnings: string[];
    integrityWarnings: string[];
  }> {
    const securityWarnings: string[] = [];
    const integrityWarnings: string[] = [];

    // Security validation
    const securityCheck = this.validateSecurity(newCode);
    securityWarnings.push(...securityCheck.warnings);

    // Calculate actual hash
    const actualHash = await this.calculateHash(newCode);

    // Check for expected hash
    if (expectedHash) {
      const hashValid = await this.verifySignature(newCode, expectedHash);
      if (!hashValid) {
        integrityWarnings.push("Expected hash does not match actual hash");
      }
    }

    // Check against previous version
    if (oldHash && oldHash === actualHash) {
      integrityWarnings.push("Script content is identical to previous version");
    }

    return {
      valid: securityCheck.valid && integrityWarnings.length === 0,
      actualHash,
      securityWarnings,
      integrityWarnings,
    };
  }
}
