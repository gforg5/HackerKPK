export type UserRole = 'admin' | 'teacher' | 'student';
export type UserStatus = 'pending' | 'approved';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  accessPassword?: string;
  displayName?: string;
  photoURL?: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  createdAt: any;
  category?: string;
  thumbnailUrl?: string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  averageRating?: number;
  ratingCount?: number;
}

export interface Rating {
  id: string;
  uid: string;
  courseId: string;
  rating: number; // 1-5
  createdAt: any;
}

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  content: string;
  order: number;
  fileUrls?: string[];
}

export interface UserProgress {
  uid: string;
  courseId: string;
  completedLessons: string[];
  lastAccessed: any;
  completionPercentage: number;
  lessonNotes?: { [lessonId: string]: string };
}

export interface Badge {
  id: string;
  uid: string;
  courseId: string;
  courseTitle: string;
  awardedAt: any;
  icon?: string;
}

export interface Certificate {
  id: string;
  uid: string;
  courseId: string;
  courseTitle: string;
  studentName: string;
  issuedAt: any;
  certificateNumber: string;
}
