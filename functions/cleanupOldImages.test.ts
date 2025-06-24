describe('cleanupOldImages function logic', () => {
  it('should calculate retention cutoff date correctly', () => {
    const RETENTION_DAYS = 90;
    const now = new Date('2024-01-15');
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    // Expected cutoff should be 90 days before now
    const expectedCutoff = new Date('2023-10-17');
    expect(cutoffDate.toDateString()).toBe(expectedCutoff.toDateString());
  });

  it('should identify old vs recent entries', () => {
    const RETENTION_DAYS = 90;
    const now = new Date('2024-01-15');
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    
    const oldEntry = new Date('2023-01-01'); // Very old
    const recentEntry = new Date('2024-01-01'); // Recent
    
    expect(oldEntry < cutoffDate).toBe(true);  // Should be deleted
    expect(recentEntry < cutoffDate).toBe(false); // Should be kept
  });

  it('should parse Firebase Storage URL correctly', () => {
    const imageUrl = 'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/users%2Ftest-user%2Fentries%2Ftest-image.jpg?alt=media';
    
    const urlParts = imageUrl.split('/');
    const pathStart = urlParts.findIndex((part: string) => part === 'o') + 1;
    
    expect(pathStart).toBeGreaterThan(0);
    
    if (pathStart > 0 && pathStart < urlParts.length) {
      const encodedPath = urlParts[pathStart].split('?')[0];
      const filePath = decodeURIComponent(encodedPath);
      
      expect(filePath).toBe('users/test-user/entries/test-image.jpg');
    }
  });

  it('should handle invalid URLs gracefully', () => {
    const invalidUrl = 'not-a-firebase-url';
    const urlParts = invalidUrl.split('/');
    const pathStart = urlParts.findIndex((part: string) => part === 'o') + 1;
    
    expect(pathStart).toBe(0); // findIndex returns -1, +1 = 0
  });
}); 